/**
 * dev-only mock of the host half's `/api/plugin-suite/*` backend.
 *
 * Mirrors index.js shapes: /status projection, an event ring, and a serial job
 * engine that walks entries step by step. The simulation deliberately includes
 * one failing entry (computer-user), one version-exemption entry
 * (openclaw-bridge: warn → ok) and one build-script-warning entry
 * (agent-teams: warn → ok) whenever the job touches them.
 */
import { ENTRIES, INITIAL_STATE } from './mock-entries.mjs'

export const SUITE_VERSION = '0.1.1'
export const RETIRED = []

const ALL = [...ENTRIES.eac, ...ENTRIES.aio, ...ENTRIES.skins]
const BY_ID = new Map(ALL.map((e) => [e.id, e]))

/** Entries with scripted outcomes for the install simulation. */
export const SCRIPTED = {
  fail: 'computer-user',
  exempt: 'openclaw-bridge',
  warn: 'agent-teams',
}

const FAIL_MESSAGE =
  'install failed: ERESOLVE unable to resolve dependency tree — peer @deepseek-ai/dsh-runtime@0.2.0-rc.2 not found'
const EXEMPT_RUNTIME = '0.2.0-rc.2'

export function createSuiteStore() {
  const state = {
    installed: new Set(INITIAL_STATE.installed),
    disabled: new Set(INITIAL_STATE.disabled),
    installedVersions: { ...INITIAL_STATE.installedVersions },
    events: [],
    listeners: new Set(),
    jobSeq: 0,
    currentJob: null,
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  function emit(event) {
    const e = { ts: Date.now(), ...event }
    state.events.push(e)
    if (state.events.length > 500) state.events.splice(0, state.events.length - 500)
    for (const fn of [...state.listeners]) {
      try {
        fn(e)
      } catch {
        /* dead listener */
      }
    }
  }

  function projectEntry(entry) {
    const installed = state.installed.has(entry.id)
    const installedVersion = installed
      ? (state.installedVersions[entry.id] ?? entry.version)
      : null
    return {
      id: entry.id,
      name: entry.name,
      version: entry.version,
      installedVersion,
      installed,
      enabled: installed ? !state.disabled.has(entry.id) : null,
      updateAvailable: installed && installedVersion !== entry.version,
      tier: entry.tier,
      defaultEnabled: entry.defaultEnabled,
      titleZh: entry.titleZh,
      titleEn: entry.titleEn,
      descZh: entry.descZh,
      descEn: entry.descEn,
      source: entry.source,
      license: entry.license,
      notes: entry.notes,
    }
  }

  function status() {
    const packs = {
      eac: ENTRIES.eac.map(projectEntry),
      aio: ENTRIES.aio.map(projectEntry),
      skins: ENTRIES.skins.map(projectEntry),
    }
    const bundles = ALL.filter((e) => state.installed.has(e.id)).map((e) => ({
      name: e.name,
      version: state.installedVersions[e.id] ?? e.version,
      enabled: !state.disabled.has(e.id),
      state: 'loaded',
      kind: 'plugin',
      source: null,
    }))
    return {
      suiteVersion: SUITE_VERSION,
      packs,
      retired: RETIRED,
      bundles,
      currentJob: state.currentJob,
    }
  }

  function emptyStatus() {
    return {
      suiteVersion: SUITE_VERSION,
      packs: { eac: [], aio: [], skins: [] },
      retired: RETIRED,
      bundles: [],
      currentJob: null,
    }
  }

  function selectEntries(pack, ids) {
    const list = pack
      ? ENTRIES[pack] ?? []
      : [...ENTRIES.eac, ...ENTRIES.aio, ...ENTRIES.skins]
    if (!ids?.length) return list
    const wanted = new Set(ids)
    return list.filter((e) => wanted.has(e.id))
  }

  function markInstalled(entry) {
    state.installed.add(entry.id)
    state.installedVersions[entry.id] = entry.version
    if (entry.defaultEnabled !== false) state.disabled.delete(entry.id)
    else state.disabled.add(entry.id)
  }

  function markRemoved(entry) {
    state.installed.delete(entry.id)
    state.disabled.delete(entry.id)
    delete state.installedVersions[entry.id]
  }

  /** Serial simulated job — same event choreography as index.js executeJob. */
  async function executeJob(job) {
    const entries = selectEntries(job.pack, job.ids)
    state.currentJob = { id: job.id, type: job.type, pack: job.pack }
    const snapshot = entries.length ? `20261001T130000-${job.type}-${++state.jobSeq}` : null
    emit({ type: 'job-start', jobId: job.id, jobType: job.type, pack: job.pack, total: entries.length, snapshot })
    let ok = 0
    let failed = 0
    for (const entry of entries) {
      emit({ type: 'step-start', jobId: job.id, id: entry.id, name: entry.name, version: entry.version })
      await sleep(job.stepDelay)
      if (job.type === 'uninstall') {
        markRemoved(entry)
        emit({ type: 'step-ok', jobId: job.id, id: entry.id })
        ok++
        continue
      }
      if (entry.id === SCRIPTED.fail) {
        emit({ type: 'step-fail', jobId: job.id, id: entry.id, message: FAIL_MESSAGE })
        failed++
        continue
      }
      if (entry.id === SCRIPTED.exempt) {
        emit({
          type: 'step-warn',
          jobId: job.id,
          id: entry.id,
          message: `granting version exemption for ${entry.name}@${entry.version} on ${EXEMPT_RUNTIME}`,
        })
        emit({ type: 'step-ok', jobId: job.id, id: entry.id, message: 'installed with version exemption' })
        markInstalled(entry)
        ok++
        continue
      }
      if (entry.id === SCRIPTED.warn) {
        emit({ type: 'step-warn', jobId: job.id, id: entry.id, message: 'approving build scripts: esbuild' })
      }
      markInstalled(entry)
      emit({ type: 'step-ok', jobId: job.id, id: entry.id })
      ok++
    }
    emit({ type: 'job-done', jobId: job.id, jobType: job.type, pack: job.pack, ok, failed })
    state.currentJob = null
  }

  function enqueueJob({ type, pack, ids, stepDelay = 550 }) {
    const job = { id: `job-${Date.now()}-${++state.jobSeq}`, type, pack, ids, stepDelay }
    // fire and forget: the UI follows the SSE stream, like the real queue
    executeJob(job).catch(() => {})
    return job
  }

  return {
    status,
    emptyStatus,
    enqueueJob,
    ring: () => [...state.events],
    subscribe: (fn) => {
      state.listeners.add(fn)
      return () => state.listeners.delete(fn)
    },
  }
}
