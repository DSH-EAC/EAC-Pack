import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { apply, __test } from '../index.js'

const { state, loadChannelConfig, saveChannelConfig, buildChannelStatus } = __test

/** Minimal http-like mocks so the API handlers can run without a kernel. */
function makeRes() {
  const res = {
    statusCode: 0,
    headers: null,
    body: '',
    writeHead(status, headers) {
      this.statusCode = status
      this.headers = headers
    },
    end(payload) {
      if (payload) this.body += payload
    },
    write() {},
  }
  return res
}

function makeReq(url, method = 'GET', body) {
  return {
    url,
    method,
    on(event, cb) {
      if (event === 'data' && body !== undefined) cb(Buffer.from(body))
      if (event === 'end') cb()
    },
  }
}

function mockCtx({ pluginManager }) {
  const registered = []
  const webServer = {
    register(def) {
      registered.push(def)
      return () => {}
    },
  }
  const ctx = {
    pluginManager,
    logger: { info() {}, warn() {}, error() {} },
    effect(fn) {
      return fn()
    },
    inject(deps, cb) {
      cb({ webServer, pluginManager })
    },
  }
  return { ctx, registered }
}

function fakePm({ bundles = [], bundlesFor = null } = {}) {
  const installs = []
  let listCalls = 0
  return {
    installs,
    async installBundle(target, options) {
      installs.push({ target, options })
      return { pendingBuilds: [] }
    },
    async removeBundle() {
      return { ok: true }
    },
    async setBundleEnabled() {
      return { ok: true }
    },
    async listBundles() {
      listCalls++
      return bundlesFor ? bundlesFor(listCalls) : bundles
    },
  }
}

function webBody(buffer) {
  return Readable.toWeb(Readable.from([buffer]))
}

const SKIN_NAME = '@linxin666/dsh-client-ui-skin-miku'
const TARBALL = Buffer.from(`fake-tarball ${SKIN_NAME} 9.9.9`)
const TARBALL_SHA = crypto.createHash('sha256').update(TARBALL).digest('hex')

function manifestFixture(overrides = {}) {
  return {
    channelVersion: 2,
    suiteVersion: '0.2.0',
    generatedAt: '2026-10-01T12:00:00.000Z',
    notesZh: '测试渠道',
    notesEn: 'test channel',
    items: [
      { id: 'miku', name: SKIN_NAME, version: '9.9.9', packs: ['skins'], file: `${SKIN_NAME.replace(/\//g, '_')}-9.9.9.tgz`, sha256: TARBALL_SHA, bytes: TARBALL.length, source: 'npm' },
    ],
    suite: { version: '0.2.0', file: 'dsh-plugin-suite-0.2.0.tgz', sha256: 'ab'.repeat(32), bytes: 1 },
    ...overrides,
  }
}

function mockFetch(manifest, tarball = TARBALL) {
  return async (url) => {
    if (url.includes('channel.json')) {
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => manifest, body: webBody(Buffer.from('{}')) }
    }
    return {
      ok: true,
      status: 200,
      headers: { get: (k) => (String(k).toLowerCase() === 'content-length' ? String(tarball.length) : null) },
      json: async () => ({}),
      body: webBody(tarball),
    }
  }
}

beforeEach(() => {
  delete process.env.DSH_SUITE_NO_AUTOCHECK
  process.env.DSH_SUITE_NO_AUTOCHECK = '1'
  state.channel = null
  state.channelCfg = null
  state.fetchImpl = null
  state.gallery = undefined
  state.timers = []
  state.lastAutoApply = { channelVersion: null, at: 0 }
  state.events = []
  state.catalog = null
  state.distIndex = []
})

test('config roundtrips and normalizes the mirror prefix', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'suite-chan-'))
  process.env.DSH_HOME = home
  const cfg = saveChannelConfig({ mirror: 'https://ghproxy.com///', autoUpdate: false, intervalHours: 0 })
  assert.equal(cfg.mirror, 'https://ghproxy.com')
  assert.equal(cfg.autoUpdate, false)
  assert.equal(loadChannelConfig().intervalHours, 6, 'invalid interval falls back to 6')
  assert.equal(loadChannelConfig().mirror, 'https://ghproxy.com')
  delete process.env.DSH_HOME
})

test('probeChannel goes online on the first healthy source and persists state', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'suite-chan-'))
  process.env.DSH_HOME = home
  state.fetchImpl = mockFetch(manifestFixture())
  const manifest = await __test.probeChannel()
  assert.equal(manifest.channelVersion, 2)
  assert.equal(state.channelCfg.channelState, 'online')
  const persisted = JSON.parse(fs.readFileSync(path.join(home, 'plugin-suite', 'config.json'), 'utf8'))
  assert.equal(persisted.channelState, 'online')
  assert.equal(persisted.channel.channelVersion, 2)
  delete process.env.DSH_HOME
})

test('probeChannel degrades to offline when every source fails', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'suite-chan-'))
  process.env.DSH_HOME = home
  state.fetchImpl = async () => {
    throw new Error('network down')
  }
  const manifest = await __test.probeChannel()
  assert.equal(manifest, null)
  assert.equal(state.channelCfg.channelState, 'offline')
  delete process.env.DSH_HOME
})

test('channel status lists updates against catalog and installed versions', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'suite-chan-'))
  process.env.DSH_HOME = home
  state.fetchImpl = mockFetch(manifestFixture())
  await __test.probeChannel()
  const pm = fakePm({ bundles: [{ pkg: { name: SKIN_NAME, version: '0.1.11' }, enabled: false }] })
  const { ctx, registered } = mockCtx({ pluginManager: pm })
  apply(ctx, {})
  state.catalog = __test.loadCatalog()
  const status = await buildChannelStatus()
  assert.equal(status.state, 'online')
  assert.equal(status.updates.length, 1)
  assert.equal(status.updates[0].id, 'miku')
  assert.equal(status.updates[0].installedVersion, '0.1.11')
  assert.equal(status.updates[0].channelVersion, '9.9.9')
  assert.equal(status.updates[0].installed, true)
  assert.equal(status.suiteUpdate, null, 'same suite version yields no self-update notice')
  delete process.env.DSH_HOME
})

test('channel apply downloads, verifies sha256 and preserves disabled state', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'suite-chan-'))
  process.env.DSH_HOME = home
  state.fetchImpl = mockFetch(manifestFixture())
  // listBundles call #1 feeds the enabledMap (disabled skin); call #2 is the
  // post-install verification — simulate the kernel persisting the new version.
  const pm = fakePm({
    bundlesFor: (n) => (n === 1
      ? [{ pkg: { name: SKIN_NAME, version: '0.1.11' }, enabled: false }]
      : [{ pkg: { name: SKIN_NAME, version: '9.9.9' }, enabled: false }]),
  })
  const { ctx, registered } = mockCtx({ pluginManager: pm })
  apply(ctx, {})
  state.catalog = __test.loadCatalog()

  const checkRes = makeRes()
  await registered[0].handler(makeReq('http://localhost/api/plugin-suite/channel/check', 'POST', '{}'), checkRes)
  assert.equal(JSON.parse(checkRes.body).state, 'online')

  const applyRes = makeRes()
  await registered[0].handler(makeReq('http://localhost/api/plugin-suite/channel/apply', 'POST', JSON.stringify({ ids: ['miku'] })), applyRes)
  assert.equal(applyRes.statusCode, 202)
  const jobId = JSON.parse(applyRes.body).jobId
  await new Promise((r) => setTimeout(r, 50))

  assert.equal(pm.installs.length, 1)
  const target = pm.installs[0].target
  assert.ok(fs.existsSync(target), 'downloaded tarball exists in cache')
  assert.ok(target.includes(path.join('plugin-suite', 'cache')), 'tarball lands in the cache dir')
  assert.equal(fs.readFileSync(target, 'utf8'), TARBALL.toString())
  assert.equal(pm.installs[0].options.enabled, false, 'disabled skin stays disabled after update')

  const progress = state.events.filter((e) => e.type === 'download-progress')
  assert.ok(progress.length >= 1, 'download progress is streamed as events')
  const done = state.events.find((e) => e.type === 'job-done' && e.jobId === jobId)
  assert.ok(done, 'job-done emitted')
  assert.equal(done.ok, 1)
  assert.equal(done.failed, 0)
  delete process.env.DSH_HOME
})

test('downloadItem retries once and throws on persistent sha256 mismatch', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'suite-chan-'))
  process.env.DSH_HOME = home
  const bad = Buffer.from('corrupted payload')
  state.fetchImpl = mockFetch(manifestFixture(), bad)
  await __test.probeChannel()
  const item = manifestFixture().items[0]
  await assert.rejects(() => __test.downloadItem(item, 'test-job'), /sha256 mismatch/)
  assert.equal(state.events.filter((e) => e.type === 'step-warn' && /retrying once/.test(e.message ?? '')).length, 1)
  delete process.env.DSH_HOME
})

test('cached tarball with matching hash skips the download', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'suite-chan-'))
  process.env.DSH_HOME = home
  const cache = path.join(home, 'plugin-suite', 'cache')
  fs.mkdirSync(cache, { recursive: true })
  const file = path.join(cache, manifestFixture().items[0].file)
  fs.writeFileSync(file, TARBALL)
  let downloads = 0
  state.fetchImpl = async (url) => {
    if (!url.includes('channel.json')) downloads++
    return mockFetch(manifestFixture())(url)
  }
  await __test.probeChannel()
  const got = await __test.downloadItem(manifestFixture().items[0], 'test-job')
  assert.equal(got, file)
  assert.equal(downloads, 0, 'no asset fetch when cache is warm')
  delete process.env.DSH_HOME
})

test('channel/apply without a loaded channel answers 409', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'suite-chan-'))
  process.env.DSH_HOME = home
  const pm = fakePm()
  const { ctx, registered } = mockCtx({ pluginManager: pm })
  apply(ctx, {})
  const res = makeRes()
  await registered[0].handler(makeReq('http://localhost/api/plugin-suite/channel/apply', 'POST', JSON.stringify({ ids: ['miku'] })), res)
  assert.equal(res.statusCode, 409)
  delete process.env.DSH_HOME
})

test('channel update verification retries a silently dropped install', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'suite-chan-'))
  process.env.DSH_HOME = home
  state.fetchImpl = mockFetch(manifestFixture())
  // The kernel keeps reporting the old version even after installBundle —
  // the engine must notice the version did not move and retry once.
  const pm = fakePm({
    bundlesFor: () => [{ pkg: { name: SKIN_NAME, version: '0.1.11' }, enabled: false }],
  })
  const { ctx, registered } = mockCtx({ pluginManager: pm })
  apply(ctx, {})
  state.catalog = __test.loadCatalog()

  await registered[0].handler(makeReq('http://localhost/api/plugin-suite/channel/check', 'POST', '{}'), makeRes())
  const applyRes = makeRes()
  await registered[0].handler(makeReq('http://localhost/api/plugin-suite/channel/apply', 'POST', JSON.stringify({ ids: ['miku'] })), applyRes)
  assert.equal(applyRes.statusCode, 202)
  await new Promise((r) => setTimeout(r, 50))

  assert.equal(pm.installs.length, 2, 'dropped install is retried exactly once')
  const warn = state.events.find((e) => e.type === 'step-warn' && /did not persist/.test(e.message ?? ''))
  assert.ok(warn, 'retry warning emitted')
  // The kernel still reports the old version after the retry — the engine must
  // surface an honest failure instead of an optimistic ok.
  const done = state.events.find((e) => e.type === 'job-done')
  assert.equal(done.ok, 0)
  assert.equal(done.failed, 1)
  const fail = state.events.find((e) => e.type === 'step-fail' && /still not persisted/.test(e.message ?? ''))
  assert.ok(fail, 'honest failure emitted with restart advice')
  delete process.env.DSH_HOME
})
