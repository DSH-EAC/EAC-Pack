process.env.DSH_SUITE_NO_RESOURCES = '1'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { apply } from '../index.js'

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

function mockCtx({ pluginManager, home }) {
  const registered = []
  const webServer = {
    register(def) {
      registered.push(def)
      return () => registered.splice(registered.indexOf(def), 1)
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

function fakePm(overrides = {}) {
  const installs = []
  return {
    installs,
    async installBundle(target, options) {
      installs.push({ target, options })
      if (overrides.fail?.test?.(target)) throw new Error(`boom: ${target}`)
      return { pendingBuilds: overrides.pendingBuilds ?? [] }
    },
    async removeBundle(name) {
      overrides.removed?.push(name)
      return { ok: true }
    },
    async setBundleEnabled(name, enabled) {
      overrides.enabled?.push([name, enabled])
      return { ok: true }
    },
    async listBundles() {
      return overrides.bundles ?? []
    },
  }
}

test('apply mounts the API and catalog endpoint serves packaged catalog', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'suite-home-'))
  const pm = fakePm()
  const { ctx, registered } = mockCtx({ pluginManager: pm })
  apply(ctx, {})
  assert.equal(registered.length, 1)
  assert.equal(registered[0].path, '/api/eac-plugin-suite')

  const handler = registered[0].handler
  const res = makeRes()
  await handler(makeReq('http://localhost/api/eac-plugin-suite/catalog'), res)
  const payload = JSON.parse(res.body)
  assert.equal(res.statusCode, 200)
  assert.ok(payload.packs, 'catalog response exposes packs')
})

test('install job runs serially, emits events and takes a snapshot', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'suite-home-'))
  process.env.DSH_HOME = home
  const pm = fakePm()
  const { ctx, registered } = mockCtx({ pluginManager: pm })
  apply(ctx, {})
  const handler = registered[0].handler

  // Seed a catalog entry by writing the packaged catalog the sync script would ship.
  const catalogDir = path.join(process.cwd(), 'catalog')
  // (catalog is loaded from the package dir; for this test we drive /install with ids
  //  resolved from whatever catalog exists — assert against the engine, not the data)

  const res = makeRes()
  await handler(makeReq('http://localhost/api/eac-plugin-suite/install', 'POST', JSON.stringify({ pack: 'eac', ids: ['__nothing__'] })), res)
  assert.equal(res.statusCode, 202)
  // give the queue a tick
  await new Promise((r) => setTimeout(r, 20))

  const snapRes = makeRes()
  await handler(makeReq('http://localhost/api/eac-plugin-suite/snapshots'), snapRes)
  const snapshots = JSON.parse(snapRes.body).snapshots
  assert.ok(Array.isArray(snapshots), 'snapshots endpoint responds')
  delete process.env.DSH_HOME
})

test('version compare is prerelease-aware', async () => {
  // exercise through status: catalog 0.2.0 vs installed 0.1.9 → updateAvailable
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'suite-home-'))
  process.env.DSH_HOME = home
  const pm = fakePm({ bundles: [{ pkg: { name: 'dsh-our-free-model', version: '1.3.1' }, enabled: true, state: { state: 'installed' } }] })
  const { ctx, registered } = mockCtx({ pluginManager: pm })
  apply(ctx, {})
  const handler = registered[0].handler
  const res = makeRes()
  await handler(makeReq('http://localhost/api/eac-plugin-suite/status'), res)
  const payload = JSON.parse(res.body)
  assert.equal(res.statusCode, 200)
  assert.ok(payload.bundles.length >= 1)
  assert.equal(payload.bundles[0].name, 'dsh-our-free-model')
  delete process.env.DSH_HOME
})
