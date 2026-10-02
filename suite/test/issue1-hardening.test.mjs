import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { apply, __test } from '../index.js'

// Issue #1 hardening: kernel-provided skips, compat gates, ghost sweep and the
// boot retire of installed duplicates. Catalog content is injected through
// __test.state so these tests never depend on packaged catalog drift.

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
  const pm = {
    installs: [],
    removed: overrides.removed ?? [],
    enabledCalls: overrides.enabled ?? [],
    async installBundle(target, options) {
      pm.installs.push({ target, options })
      return { pendingBuilds: [] }
    },
    async removeBundle(name) {
      pm.removed.push(name)
      return { ok: true }
    },
    async setBundleEnabled(name, enabled) {
      pm.enabledCalls.push([name, enabled])
      return { ok: true }
    },
    async listBundles() {
      if (overrides.bundles) return overrides.bundles
      // reflect installs so the engine's verification pass sees persisted state
      return pm.installs.map(({ target }) => ({
        pkg: { name: String(target).split('/').pop().split('\\').pop(), version: '1.0.0' },
        enabled: true,
      }))
    },
  }
  return pm
}

function catalogWith(...entries) {
  return { packs: { eac: entries, aio: [], skins: [] }, retired: [] }
}

const COMPAT_ENTRY = {
  id: 'side-session',
  name: '@dsh-external/dsh-side-session',
  version: '0.2.8',
  tier: 'visual',
  defaultEnabled: false,
  compat: 'eac-fork',
}
const KERNEL_ENTRY = {
  id: 'plugin-manager',
  name: '@deepseek-ai/dsh-plugin-manager',
  version: '0.1.0',
  tier: 'core',
  defaultEnabled: false,
  kernelProvided: true,
}
const PLAIN_ENTRY = {
  id: 'plain',
  name: 'dsh-plain-plugin',
  version: '1.0.0',
  tier: 'core',
  defaultEnabled: true,
}

function tempHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'suite-issue1-'))
  process.env.DSH_HOME = home
  return home
}

test('installSkipReason gates compat and kernelProvided entries, force overrides', () => {
  const job = { type: 'install' }
  assert.equal(__test.installSkipReason(COMPAT_ENTRY, job)?.reason, 'compat-eac-fork')
  assert.equal(__test.installSkipReason(KERNEL_ENTRY, job)?.reason, 'kernel-provided')
  assert.equal(__test.installSkipReason(PLAIN_ENTRY, job), null)
  assert.equal(__test.installSkipReason(COMPAT_ENTRY, { type: 'install', force: true }), null)
  assert.equal(__test.installSkipReason(KERNEL_ENTRY, { type: 'install', force: true }), null)
  // uninstall is never skipped
  assert.equal(__test.installSkipReason(COMPAT_ENTRY, { type: 'uninstall' }), null)
})

test('install job skips compat/kernelProvided entries without touching pluginManager', async () => {
  const home = tempHome()
  const pm = fakePm()
  const { ctx, registered } = mockCtx({ pluginManager: pm })
  apply(ctx, {})
  __test.state.catalog = catalogWith(COMPAT_ENTRY, KERNEL_ENTRY, PLAIN_ENTRY)
  __test.state.distIndex = []
  try {
    const res = makeRes()
    await handlerOf(registered).runInstall(res)
    assert.equal(res.statusCode, 202)
    await new Promise((r) => setTimeout(r, 30))
    assert.equal(pm.installs.length, 1, 'only the plain entry reaches installBundle')
    assert.ok(pm.installs[0].target.includes('dsh-plain-plugin') || pm.installs[0].target === 'dsh-plain-plugin')
    const warns = __test.state.events.filter((e) => e.type === 'step-warn' && /skipped:/.test(e.message ?? ''))
    assert.ok(warns.some((e) => /settingsScope/.test(e.message)), 'compat skip explains settingsScope')
    assert.ok(warns.some((e) => /built into the kernel/.test(e.message)), 'kernelProvided skip explains shadowing')
    // skipped entries must not enter the "did not persist" retry loop
    const retries = __test.state.events.filter((e) => e.type === 'step-warn' && /did not persist/.test(e.message ?? ''))
    assert.equal(retries.length, 0, 'no retry churn for skipped entries')
  } finally {
    delete process.env.DSH_HOME
    __test.state.catalog = null
  }
})

test('enable endpoint refuses compat and kernelProvided entries', async () => {
  const home = tempHome()
  const pm = fakePm()
  const { ctx, registered } = mockCtx({ pluginManager: pm })
  apply(ctx, {})
  __test.state.catalog = catalogWith(COMPAT_ENTRY, KERNEL_ENTRY, PLAIN_ENTRY)
  try {
    const handler = registered[0].handler
    const res1 = makeRes()
    await handler(makeReq('http://localhost/api/plugin-suite/enable', 'POST', JSON.stringify({ id: 'side-session', enabled: true })), res1)
    assert.equal(res1.statusCode, 409)
    assert.ok(/settingsScope/.test(JSON.parse(res1.body).error))

    const res2 = makeRes()
    await handler(makeReq('http://localhost/api/plugin-suite/enable', 'POST', JSON.stringify({ id: 'plugin-manager', enabled: true })), res2)
    assert.equal(res2.statusCode, 409)
    assert.ok(/built into the kernel|kernel/i.test(JSON.parse(res2.body).error))

    const res3 = makeRes()
    await handler(makeReq('http://localhost/api/plugin-suite/enable', 'POST', JSON.stringify({ id: 'plain', enabled: true })), res3)
    assert.equal(res3.statusCode, 200)
    assert.deepEqual(pm.enabledCalls, [['dsh-plain-plugin', true]])
  } finally {
    delete process.env.DSH_HOME
    __test.state.catalog = null
  }
})

test('sweepGhosts removes undeclared residue and honors all four declaration guards', async () => {
  const home = tempHome()
  const nm = path.join(home, 'profiles', 'desktop', 'node_modules')
  const ghostPkg = path.join(nm, '@deepseek-ai', 'dsh-plugin-manager')
  const ghostPlain = path.join(nm, 'dsh-compact')
  fs.mkdirSync(ghostPkg, { recursive: true })
  fs.writeFileSync(path.join(ghostPkg, 'package.json'), '{"name":"@deepseek-ai/dsh-plugin-manager","version":"0.1.0"}')
  fs.mkdirSync(ghostPlain, { recursive: true })
  fs.writeFileSync(path.join(ghostPlain, 'placeholder.txt'), 'husk')
  // declared via dependencies
  const keptDep = path.join(nm, '@deepseek-ai', 'dsh-terminal')
  fs.mkdirSync(keptDep, { recursive: true })
  // undeclared plain ghost (its catalog entry has no guards)
  const ghostBare = path.join(nm, 'dsh-plain-plugin')
  fs.mkdirSync(ghostBare, { recursive: true })
  const profile = path.join(home, 'profiles', 'desktop')
  fs.writeFileSync(
    path.join(profile, 'package.json'),
    JSON.stringify({ dependencies: { '@deepseek-ai/dsh-terminal': '0.1.0' } }),
  )
  // declared via pnpm-lock
  fs.writeFileSync(path.join(profile, 'pnpm-lock.yaml'), '  dsh-compact@1.0.1:\n    resolution: {integrity: x}\n')
  __test.state.catalog = catalogWith(KERNEL_ENTRY, COMPAT_ENTRY, PLAIN_ENTRY, {
    id: 'compact', name: 'dsh-compact', version: '1.0.1',
  })
  try {
    const removed = await __test.sweepGhosts('test')
    assert.ok(removed.includes('@deepseek-ai/dsh-plugin-manager'), 'undeclared scoped ghost removed')
    assert.ok(removed.includes('dsh-plain-plugin'), 'undeclared plain ghost removed')
    assert.ok(!removed.includes('dsh-compact'), 'name appearing in pnpm-lock is kept')
    assert.ok(!removed.includes('@deepseek-ai/dsh-terminal'), 'dependency-declared package kept')
    assert.equal(fs.existsSync(ghostPkg), false)
    assert.equal(fs.existsSync(ghostBare), false)
    assert.equal(fs.existsSync(keptDep), true)
    assert.equal(fs.existsSync(ghostPlain), true, 'lock-declared directory stays')
  } finally {
    delete process.env.DSH_HOME
    __test.state.catalog = null
  }
})

test('sweepGhosts keeps packages reported by listBundles', async () => {
  const home = tempHome()
  const nm = path.join(home, 'profiles', 'desktop', 'node_modules')
  const ghost = path.join(nm, 'dsh-plain-plugin')
  fs.mkdirSync(ghost, { recursive: true })
  __test.state.catalog = catalogWith(PLAIN_ENTRY)
  const pm = fakePm({ bundles: [{ pkg: { name: 'dsh-plain-plugin', version: '1.0.0' }, enabled: true }] })
  __test.state.pm = pm
  try {
    const removed = await __test.sweepGhosts('test')
    assert.deepEqual(removed, [], 'listBundles-reported packages are never swept')
    assert.equal(fs.existsSync(ghost), true)
  } finally {
    delete process.env.DSH_HOME
    __test.state.catalog = null
    __test.state.pm = null
  }
})

test('retireKernelProvided uninstalls installed duplicates offline (no pm needed)', async () => {
  const home = tempHome()
  const nm = path.join(home, 'profiles', 'desktop', 'node_modules')
  const dup = path.join(nm, '@deepseek-ai', 'dsh-plugin-manager')
  fs.mkdirSync(dup, { recursive: true })
  fs.writeFileSync(path.join(dup, 'package.json'), '{"name":"@deepseek-ai/dsh-plugin-manager","version":"0.1.0"}')
  const profile = path.join(home, 'profiles', 'desktop')
  fs.writeFileSync(
    path.join(profile, 'package.json'),
    JSON.stringify({
      dependencies: { '@deepseek-ai/dsh-plugin-manager': '0.1.0', 'dsh-plain-plugin': '1.0.0' },
      dsh: { profile: { bundles: ['dsh-plain-plugin', '@deepseek-ai/dsh-plugin-manager'] } },
    }),
  )
  __test.state.catalog = catalogWith(KERNEL_ENTRY, PLAIN_ENTRY, COMPAT_ENTRY)
  const pm = fakePm()
  __test.state.pm = pm
  try {
    const removed = await __test.retireKernelProvided('test')
    assert.deepEqual(removed, ['@deepseek-ai/dsh-plugin-manager'])
    assert.equal(fs.existsSync(dup), false, 'duplicate directory removed')
    const pkg = JSON.parse(fs.readFileSync(path.join(profile, 'package.json'), 'utf8'))
    assert.equal(pkg.dependencies['@deepseek-ai/dsh-plugin-manager'], undefined, 'dependency row dropped')
    assert.equal(pkg.dependencies['dsh-plain-plugin'], '1.0.0', 'unrelated dependency kept')
    assert.ok(!pkg.dsh.profile.bundles.includes('@deepseek-ai/dsh-plugin-manager'), 'bundle row dropped')
    assert.ok(pkg.dsh.profile.bundles.includes('dsh-plain-plugin'), 'unrelated bundle kept')
    assert.deepEqual(pm.removed, [], 'works without any pluginManager involvement')
  } finally {
    delete process.env.DSH_HOME
    __test.state.catalog = null
    __test.state.pm = null
  }
})

// helpers ------------------------------------------------------------------

function handlerOf(registered) {
  const handler = registered[0].handler
  return {
    async runInstall(res) {
      return handler(makeReq('http://localhost/api/plugin-suite/install', 'POST', JSON.stringify({ pack: 'eac' })), res)
    },
  }
}
