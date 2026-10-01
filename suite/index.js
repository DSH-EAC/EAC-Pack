/**
 * dsh-plugin-suite — Host half.
 *
 * One plugin that carries the whole EAC/AIO plugin suite: a built-in catalog
 * (EAC 41 active plugins, AIO 9 + third-party runtime bundles, 10 optional
 * skins), a settings-page installer UI (client half), and this host half that
 * drives the kernel's own PluginManager to install / enable / update / remove
 * catalog entries on the current profile.
 *
 * Wiring:
 * - `pluginManager` (required) — the same service the Web plugin page and the
 *   `dsh plugin` CLI use. Install/remove/enable all go through it, so every
 *   operation inherits the kernel's own pre-checks, snapshot and rollback.
 * - `webServer` (optional, lazy) — mounts the JSON API the settings tab reads
 *   at `/api/plugin-suite/*` plus an SSE stream for install progress.
 *
 * Everything else is deliberately self-contained: the catalog ships inside the
 * package (`catalog/*.json`, repacked tarballs under `assets/dist/`), snapshots
 * land under `$DSH_HOME/plugin-suite/`, and no network call is ever required —
 * a catalog entry without a local tarball falls back to its registry spec.
 *
 * @module index.js
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'plugin-suite'

/** Nothing required at start: services resolve lazily so a missing one
 *  degrades a feature instead of failing the whole plugin. */
export const inject = []

/** Installed package directory — catalog, dist tarballs and locale read from here. */
const PKG_DIR = fileURLToPath(new URL('./', import.meta.url))

/** Plugin data dir resolved lazily (DSH_HOME must be read at call time). */
function dataDir() {
  return path.join(resolveDshHome(), 'plugin-suite')
}
function snapshotDir() {
  return path.join(dataDir(), 'snapshots')
}
function logDir() {
  return path.join(dataDir(), 'logs')
}

/** Profile files captured by every snapshot. */
const PROFILE_FILES = ['package.json', 'pnpm-lock.yaml', 'compatibility.json']

/** Event ring kept in memory (and mirrored to disk) so late SSE clients catch up. */
const EVENT_RING_MAX = 500

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

const PACK_IDS = ['eac', 'aio', 'skins']

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function normalizeEntries(json) {
  const list = Array.isArray(json) ? json : Array.isArray(json?.plugins) ? json.plugins : []
  return list.filter((e) => e && e.id && e.name)
}

function loadCatalog() {
  const packs = {}
  for (const pack of PACK_IDS) {
    const json = readJson(path.join(PKG_DIR, 'catalog', `${pack}.json`))
    packs[pack] = normalizeEntries(json)
  }
  const retired = normalizeEntries(readJson(path.join(PKG_DIR, 'catalog', 'retired.json')))
  return { packs, retired }
}

/** `dist/index.json` from the repack pipeline: [{id,name,version,packs,file,sha256,bytes}] */
function loadDistIndex() {
  const json = readJson(path.join(PKG_DIR, 'assets', 'dist', 'index.json'))
  if (!Array.isArray(json)) return []
  return json.filter((e) => e && e.file)
}

/**
 * Install target for a catalog entry: a bundled tarball when we have one
 * (offline, version-pinned), otherwise the entry's registry/git spec.
 */
function resolveTarget(entry, distIndex) {
  const hit =
    distIndex.find((d) => d.name === entry.name && d.version === entry.version) ??
    distIndex.find((d) => d.id === entry.id && d.version === entry.version)
  if (hit) {
    const file = path.join(PKG_DIR, 'assets', 'dist', hit.file)
    if (fs.existsSync(file)) return file
  }
  if (entry.tgz) {
    const file = path.join(PKG_DIR, 'assets', 'dist', entry.tgz)
    if (fs.existsSync(file)) return file
  }
  return entry.spec ?? entry.name
}

// ---------------------------------------------------------------------------
// Versions (small semver compare, prerelease aware)
// ---------------------------------------------------------------------------

function parseVersion(v) {
  const m = String(v ?? '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/)
  if (!m) return null
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ?? null }
}

function cmpVersions(a, b) {
  const va = parseVersion(a)
  const vb = parseVersion(b)
  if (!va && !vb) return 0
  if (!va) return -1
  if (!vb) return 1
  for (const k of ['major', 'minor', 'patch']) {
    if (va[k] !== vb[k]) return va[k] < vb[k] ? -1 : 1
  }
  // A release outranks any prerelease of the same triple; otherwise dot-split
  // identifier comparison (numeric identifiers compare numerically, ASCII otherwise).
  if (va.pre !== vb.pre) {
    if (va.pre === null) return 1
    if (vb.pre === null) return -1
    const pa = va.pre.split('.')
    const pb = vb.pre.split('.')
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i]
      const y = pb[i]
      if (x === undefined) return -1
      if (y === undefined) return 1
      const nx = /^\d+$/.test(x)
      const ny = /^\d+$/.test(y)
      if (nx && ny) {
        if (+x !== +y) return +x < +y ? -1 : 1
      } else if (nx !== ny) {
        return nx ? -1 : 1
      } else if (x !== y) {
        return x < y ? -1 : 1
      }
    }
  }
  return 0
}

// ---------------------------------------------------------------------------
// PluginManager adapter — defensive so a signature drift degrades one feature,
// never the plugin.
// ---------------------------------------------------------------------------

function pmCall(pm, method, ...args) {
  const fn = pm?.[method]
  if (typeof fn !== 'function') {
    throw new Error(`pluginManager.${method} is unavailable on this kernel`)
  }
  return pm[method](...args)
}

function normalizeBundle(b) {
  const pkg = b?.pkg ?? b?.package ?? {}
  const name = pkg.name ?? b?.name ?? b?.id
  if (!name) return null
  return {
    name,
    version: pkg.version ?? b?.version ?? '',
    enabled: b?.enabled ?? b?.state?.enabled ?? null,
    state: b?.state?.state ?? b?.state ?? null,
    kind: b?.kind ?? null,
    source: b?.source ?? null,
    raw: undefined,
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

const state = {
  events: [],
  listeners: new Set(),
  currentJob: null,
  queueTail: Promise.resolve(),
  catalog: null,
  distIndex: [],
}

function emit(event) {
  const e = { ts: Date.now(), ...event }
  state.events.push(e)
  if (state.events.length > EVENT_RING_MAX) state.events.splice(0, state.events.length - EVENT_RING_MAX)
  persistEvent(e)
  for (const listener of state.listeners) {
    try {
      listener(e)
    } catch {
      /* a dead SSE client must never break the queue */
    }
  }
}

function persistEvent(e) {
  try {
    fs.mkdirSync(dataDir(), { recursive: true })
    fs.appendFileSync(path.join(dataDir(), "events.jsonl"), JSON.stringify(e) + '\n')
  } catch {
    /* disk problems must not break installs */
  }
}

function appendJobLog(jobId, line) {
  try {
    fs.mkdirSync(logDir(), { recursive: true })
    fs.appendFileSync(path.join(logDir(), `${jobId}.log`), `[${new Date().toISOString()}] ${line}\n`)
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Snapshot / restore (belt and braces on top of the kernel's own rollback)
// ---------------------------------------------------------------------------

function snapshotProfile(label = 'manual') {
  const profile = path.join(resolveDshHome(), 'profiles', activeProfileName())
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = path.join(snapshotDir(), `${stamp}-${label}`)
  const taken = []
  fs.mkdirSync(dir, { recursive: true })
  for (const file of PROFILE_FILES) {
    const src = path.join(profile, file)
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(dir, file))
      taken.push(file)
    }
  }
  pruneSnapshots(10)
  return { name: path.basename(dir), files: taken }
}

function pruneSnapshots(keep) {
  try {
    const dirs = fs
      .readdirSync(snapshotDir())
      .filter((d) => fs.statSync(path.join(snapshotDir(), d)).isDirectory())
      .sort()
    for (const d of dirs.slice(0, Math.max(0, dirs.length - keep))) {
      fs.rmSync(path.join(snapshotDir(), d), { recursive: true, force: true })
    }
  } catch {
    /* ignore */
  }
}

function listSnapshots() {
  try {
    return fs
      .readdirSync(snapshotDir())
      .filter((d) => fs.statSync(path.join(snapshotDir(), d)).isDirectory())
      .sort()
      .reverse()
      .map((name) => ({ name, files: fs.readdirSync(path.join(snapshotDir(), name)) }))
  } catch {
    return []
  }
}

/**
 * Restore is only safe while the app is quit; the API answers with
 * `restartRequired: true` so the UI can say so.
 */
function restoreSnapshot(name) {
  const safe = String(name ?? '').replace(/[^0-9A-Za-z-]/g, '')
  const dir = path.join(snapshotDir(), safe)
  if (!safe || !fs.existsSync(dir)) return { ok: false, error: 'snapshot not found' }
  const profile = path.join(resolveDshHome(), 'profiles', activeProfileName())
  for (const file of PROFILE_FILES) {
    const src = path.join(dir, file)
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(profile, file))
  }
  return { ok: true, restartRequired: true }
}

/** The suite manages the profile it runs in; overridable for tests. */
function activeProfileName() {
  return process.env.DSH_SUITE_PROFILE ?? 'desktop'
}

function resolveDshHome() {
  if (process.env.DSH_HOME) return path.resolve(process.env.DSH_HOME)
  return path.join(os.homedir(), '.dsh')
}

// ---------------------------------------------------------------------------
// Job engine — serial install / update / uninstall queue with progress events
// ---------------------------------------------------------------------------

function enqueue(job) {
  const run = state.queueTail.then(() => executeJob(job))
  state.queueTail = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function executeJob(job) {
  state.currentJob = { id: job.id, type: job.type, pack: job.pack }
  const entries = selectEntries(job.pack, job.ids)
  const snapshot = entries.length ? snapshotProfile(`pre-${job.type}`) : null
  emit({ type: 'job-start', jobId: job.id, jobType: job.type, pack: job.pack, total: entries.length, snapshot: snapshot?.name ?? null })
  appendJobLog(job.id, `start ${job.type} pack=${job.pack} ids=${entries.map((e) => e.id).join(',') || '*'}`)
  const results = []
  for (const entry of entries) {
    results.push(await runStep(job, entry))
  }
  const ok = results.filter((r) => r.ok).length
  emit({ type: 'job-done', jobId: job.id, jobType: job.type, pack: job.pack, ok, failed: results.length - ok })
  appendJobLog(job.id, `done ok=${ok} failed=${results.length - ok}`)
  state.currentJob = null
  return { jobId: job.id, snapshot: snapshot?.name ?? null, results }
}

function selectEntries(pack, ids) {
  const catalog = state.catalog ?? loadCatalog()
  const list = pack ? catalog.packs[pack] ?? [] : [...catalog.packs.eac, ...catalog.packs.aio, ...catalog.packs.skins]
  if (!ids?.length) return list
  const wanted = new Set(ids)
  return list.filter((e) => wanted.has(e.id))
}

async function runStep(job, entry) {
  const pm = job.pm ?? state.pm
  emit({ type: 'step-start', jobId: job.id, id: entry.id, name: entry.name, version: entry.version })
  try {
    if (job.type === 'uninstall') {
      await pmCall(pm, 'removeBundle', entry.name)
    } else {
      const target = resolveTarget(entry, state.distIndex)
      const options = {}
      if (job.type === 'install' && job.setEnabled !== false) {
        // Respect the catalog default; the kernel installs bundles disabled
        // unless told otherwise, so pass the intent explicitly.
        options.enabled = entry.defaultEnabled !== false
      }
      let result = await pmCall(pm, 'installBundle', target, options)
      // pnpm blocked build scripts: approve exactly what was reported and retry once
      const pending = result?.pendingBuilds ?? []
      if (pending.length) {
        emit({ type: 'step-warn', jobId: job.id, id: entry.id, message: `approving build scripts: ${pending.join(', ')}` })
        result = await pmCall(pm, 'installBundle', target, { ...options, approvedBuilds: pending })
      }
      if (job.type !== 'install' && typeof entry.defaultEnabled === 'boolean') {
        await syncEnabled(pm, entry, job.setEnabled !== false && entry.defaultEnabled !== false, job.id)
      }
    }
    emit({ type: 'step-ok', jobId: job.id, id: entry.id })
    appendJobLog(job.id, `ok ${entry.name}@${entry.version}`)
    return { id: entry.id, ok: true }
  } catch (err) {
    // Incompatible peer on this kernel: grant an exact-version exemption
    // (acceptRisk) and retry once — matches the kernel's own escape hatch.
    const message = String(err?.message ?? err)
    if (job.type !== 'uninstall' && job.exempt !== false && /incompat|peer|version/i.test(message)) {
      const runtime = (message.match(/\d+\.\d+\.\d+-(?:rc|alpha|beta)[.\w]*/) ?? [SUITE_RUNTIME])[0]
      try {
        emit({ type: 'step-warn', jobId: job.id, id: entry.id, message: `granting version exemption for ${entry.name}@${entry.version} on ${runtime}` })
        await pmCall(pm, 'setVersionExemption', `${entry.name}@${entry.version}`, runtime, true, true)
        const target = resolveTarget(entry, state.distIndex)
        const options = job.setEnabled !== false && job.type === 'install' ? { enabled: entry.defaultEnabled !== false } : {}
        await pmCall(pm, 'installBundle', target, options)
        emit({ type: 'step-ok', jobId: job.id, id: entry.id, message: 'installed with version exemption' })
        appendJobLog(job.id, `ok(exempt) ${entry.name}@${entry.version}`)
        return { id: entry.id, ok: true, exempt: true }
      } catch (err2) {
        const message2 = String(err2?.message ?? err2)
        emit({ type: 'step-fail', jobId: job.id, id: entry.id, message: message2 })
        appendJobLog(job.id, `FAIL ${entry.name}@${entry.version}: ${message2}`)
        return { id: entry.id, ok: false, error: message2 }
      }
    }
    emit({ type: 'step-fail', jobId: job.id, id: entry.id, message })
    appendJobLog(job.id, `FAIL ${entry.name}@${entry.version}: ${message}`)
    return { id: entry.id, ok: false, error: message }
  }
}

/** Kernel runtime the catalog targets; used as the exemption fallback. */
const SUITE_RUNTIME = '0.2.0-rc.2'

async function syncEnabled(pm, entry, enabled, jobId = 'n/a') {
  try {
    await pmCall(pm, 'setBundleEnabled', entry.name, enabled)
  } catch {
    try {
      await pmCall(pm, 'setBundleEnabled', entry.id, enabled)
    } catch (err) {
      emit({ type: 'step-warn', jobId, id: entry.id, message: `could not set enabled=${enabled}: ${String(err?.message ?? err)}` })
    }
  }
}

// ---------------------------------------------------------------------------
// Status — installed state projected onto the catalog
// ---------------------------------------------------------------------------

async function buildStatus() {
  const catalog = state.catalog
  let bundles = []
  try {
    bundles = (await pmCall(state.pm, 'listBundles')).map(normalizeBundle).filter(Boolean)
  } catch (err) {
    return { error: `listBundles failed: ${String(err?.message ?? err)}`, packs: catalog.packs, retired: catalog.retired }
  }
  const installed = new Map(bundles.map((b) => [b.name, b]))
  const project = (entries) =>
    entries.map((entry) => {
      const found = installed.get(entry.name)
      const updateAvailable = found ? cmpVersions(entry.version, found.version) > 0 : false
      return {
        id: entry.id,
        name: entry.name,
        version: entry.version,
        installedVersion: found?.version ?? null,
        installed: Boolean(found),
        enabled: found?.enabled ?? null,
        updateAvailable,
        tier: entry.tier ?? 'core',
        defaultEnabled: entry.defaultEnabled !== false,
        titleZh: entry.titleZh ?? entry.name,
        titleEn: entry.titleEn ?? entry.name,
        descZh: entry.descZh ?? '',
        descEn: entry.descEn ?? '',
        source: entry.source ?? null,
        license: entry.license ?? null,
        notes: entry.notes ?? '',
      }
    })
  const packs = {}
  for (const pack of PACK_IDS) packs[pack] = project(catalog.packs[pack])
  return {
    suiteVersion: SUITE_VERSION,
    packs,
    retired: catalog.retired,
    bundles,
    currentJob: state.currentJob,
  }
}

// ---------------------------------------------------------------------------
// HTTP API (mounted lazily on webServer)
// ---------------------------------------------------------------------------

const SUITE_VERSION = readJson(path.join(PKG_DIR, 'package.json'))?.version ?? ''

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch (err) {
        reject(new Error(`invalid JSON body: ${err.message}`))
      }
    })
    req.on('error', reject)
  })
}

function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(body)
}

function createApiHandler(ctx) {
  return async function handler(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const routePath = url.pathname.replace(/^\/api\/plugin-suite/, '').replace(/\/+$/, '') || '/'
    const method = String(req.method ?? 'GET').toUpperCase()
    try {
      if (routePath === '/events' && method === 'GET') return sse(req, res)
      if (routePath === '/catalog' && method === 'GET') {
        return json(res, 200, { suiteVersion: SUITE_VERSION, ...state.catalog, dist: state.distIndex.map(({ id, name, version, file, bytes }) => ({ id, name, version, file, bytes })) })
      }
      if (routePath === '/status' && method === 'GET') return json(res, 200, await buildStatus())
      if (routePath === '/events-ring' && method === 'GET') return json(res, 200, { events: state.events })
      if (routePath === '/snapshots' && method === 'GET') return json(res, 200, { snapshots: listSnapshots() })
      if (method === 'POST') {
        const body = await readBody(req)
        if (routePath === '/install') {
          const job = { id: `job-${Date.now()}`, type: 'install', pm: state.pm, pack: body.pack ?? null, ids: body.ids ?? null, setEnabled: body.setEnabled !== false }
          if (!job.pack && !job.ids?.length) return json(res, 400, { error: 'pack or ids required' })
          enqueue(job)
          return json(res, 202, { jobId: job.id, poll: '/api/plugin-suite/events', note: 'a profile snapshot is taken automatically when the job starts' })
        }
        if (routePath === '/update') {
          const job = { id: `job-${Date.now()}`, type: 'update', pm: state.pm, pack: body.pack ?? null, ids: body.ids ?? null }
          enqueue(job)
          return json(res, 202, { jobId: job.id })
        }
        if (routePath === '/uninstall') {
          if (!body.ids?.length) return json(res, 400, { error: 'ids required' })
          const job = { id: `job-${Date.now()}`, type: 'uninstall', pm: state.pm, pack: body.pack ?? null, ids: body.ids }
          enqueue(job)
          return json(res, 202, { jobId: job.id })
        }
        if (routePath === '/enable') {
          const catalog = state.catalog
          const all = [...catalog.packs.eac, ...catalog.packs.aio, ...catalog.packs.skins]
          const entry = all.find((e) => e.id === body.id || e.name === body.id)
          if (!entry) return json(res, 404, { error: 'unknown id' })
          await syncEnabled(state.pm, entry, body.enabled !== false)
          return json(res, 200, { ok: true })
        }
        if (routePath === '/snapshot') return json(res, 200, snapshotProfile(String(body.label ?? 'manual')))
        if (routePath === '/restore') return json(res, 200, restoreSnapshot(body.snapshot))
      }
      return json(res, 404, { error: `no route ${method} ${routePath}` })
    } catch (err) {
      return json(res, 500, { error: String(err?.message ?? err) })
    }
  }
}

function sse(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.write('retry: 3000\n\n')
  for (const e of state.events) res.write(`data: ${JSON.stringify(e)}\n\n`)
  const listener = (e) => {
    try {
      res.write(`data: ${JSON.stringify(e)}\n\n`)
    } catch {
      /* socket died */
    }
  }
  state.listeners.add(listener)
  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n')
    } catch {
      /* socket died */
    }
  }, 15000)
  req.on('close', () => {
    clearInterval(heartbeat)
    state.listeners.delete(listener)
  })
}

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

/** Persist a diagnostic trace line so a headless host can be debugged later. */
function trace(tag, detail = '') {
  try {
    fs.mkdirSync(dataDir(), { recursive: true })
    fs.appendFileSync(path.join(dataDir(), 'trace.log'), `[${new Date().toISOString()}] ${tag} ${detail}\n`)
  } catch {
    /* ignore */
  }
}

export function apply(ctx, config) {
  const logger = ctx.logger ?? {}
  trace('apply-start')
  try {
    state.ctx = ctx
    state.catalog = loadCatalog()
    state.distIndex = loadDistIndex()

    const counts = Object.entries(state.catalog.packs)
      .map(([pack, list]) => `${pack}=${list.length}`)
      .join(' ')
    logger.info?.(`[plugin-suite] catalog loaded (${counts}), dist tarballs: ${state.distIndex.length}`)

    // pluginManager resolves lazily: the installer API reports a clear error
    // until the service shows up instead of failing the plugin start.
    ctx.inject?.(['pluginManager'], (scoped) => {
      state.pm = scoped.pluginManager
      trace('pluginManager', state.pm ? 'resolved' : 'null')
      logger.info?.('[plugin-suite] pluginManager service bound')
    })

    // webServer is optional: without it the settings tab has no data source,
    // so degrade loudly instead of silently.
    ctx.inject?.(['webServer'], (scoped) => {
      const server = scoped.webServer
      if (!server || typeof server.register !== 'function') {
        trace('webServer', `unexpected shape: ${Object.keys(server ?? {}).join(',')}`)
        return
      }
      const effect = scoped.effect ?? ctx.effect
      effect?.(() => {
        try {
          const dispose = server.register({ kind: 'prefix', path: '/api/plugin-suite', handler: createApiHandler(ctx) })
          trace('webServer', 'mounted /api/plugin-suite')
          logger.info?.('[plugin-suite] API mounted at /api/plugin-suite')
          return typeof dispose === 'function' ? dispose : undefined
        } catch (err) {
          trace('webServer-register-error', String(err?.stack ?? err))
          return undefined
        }
      }, 'plugin-suite: api routes')
    })
  } catch (err) {
    trace('apply-error', String(err?.stack ?? err))
    logger.warn?.(`[plugin-suite] apply failed: ${String(err?.message ?? err)}`)
  }
}
