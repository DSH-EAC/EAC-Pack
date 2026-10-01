/**
 * dev-only preview boot: shims everything the client half expects from the DSH
 * shell so suite/client.js runs unmodified in a plain browser.
 *
 *  - window.__ModuleLoader__ collects the factory bundle and boots it into a
 *    mock ctx (slots / locale / effect).
 *  - require('react') resolves to the esbuild vendor bundle.
 *  - window.EventSource and window.fetch are mocked against the simulated
 *    backend in mock-data.mjs (job engine + SSE broadcast + channel sim).
 *  - A small dev panel (plain DOM, not part of the plugin UI) switches
 *    scenario (ready/loading/error/empty, channel online/offline/checking,
 *    updates yes/no), theme and language, and can pop the skin drawer, so
 *    every UI state can be screenshotted deterministically.
 */
import {
  createSuiteStore, SCRIPTED, GALLERY, promptTextFor, manifestFor, previewSvg,
} from './mock-data.mjs'

const { createElement: h } = window.__DEV_REACT__
const { createRoot } = window.__DEV_REACT_DOM__

const params = new URLSearchParams(location.search)
const store = createSuiteStore()

/** Scenario knobs — the panel mutates these and remounts the tab. */
const scenario = {
  mode: params.get('mode') ?? 'ready', // ready | loading | error | empty
  lang: params.get('lang') === 'en' ? 'en' : 'zh',
  theme: params.get('theme') ?? 'system', // light | dark | system
  speed: params.get('speed') === 'slow' ? 1400 : 150,
  channel: params.get('channel') ?? 'online', // online | offline | checking
  updates: params.get('updates') !== 'no', // yes | no
}
applyChannelScenario()

function applyChannelScenario() {
  store.setChannelScenario({
    online: scenario.channel !== 'offline',
    hasUpdates: scenario.updates,
    hold: scenario.channel === 'checking',
  })
}

// ---------------------------------------------------------------------------
// EventSource shim — replays the ring like the host's SSE route, then follows.
// ---------------------------------------------------------------------------
class MockEventSource {
  constructor(url) {
    this.url = url
    this.onmessage = null
    this.onerror = null
    this.onopen = null
    this._open = true
    MockEventSource._all.add(this)
    queueMicrotask(() => {
      if (!this._open) return
      this.onopen?.()
      for (const e of store.ring()) this._deliver(e)
    })
  }
  _deliver(e) {
    if (!this._open) return
    try {
      this.onmessage?.({ data: JSON.stringify(e) })
    } catch {
      /* handler error must not kill the stream */
    }
  }
  close() {
    this._open = false
    MockEventSource._all.delete(this)
  }
  static broadcast(e) {
    for (const es of [...MockEventSource._all]) es._deliver(e)
  }
}
MockEventSource._all = new Set()
window.EventSource = MockEventSource
store.subscribe((e) => MockEventSource.broadcast(e))

// ---------------------------------------------------------------------------
// fetch shim — intercepts /api/plugin-suite/*, passes everything else through.
// ---------------------------------------------------------------------------
const realFetch = window.fetch?.bind(window)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const jsonResp = (status, payload) =>
  Promise.resolve(
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }),
  )

window.fetch = async (input, init = {}) => {
  const url = String(input)
  if (!url.startsWith('/api/plugin-suite')) {
    if (!realFetch) throw new Error('[dev] no backing fetch for ' + url)
    return realFetch(input, init)
  }
  const route = url.slice('/api/plugin-suite'.length).split('?')[0] || '/'
  const method = (init.method ?? 'GET').toUpperCase()

  if (method === 'GET' && route === '/status') {
    if (scenario.mode === 'error') return jsonResp(502, { error: 'simulated: suite backend offline (ECONNREFUSED)' })
    if (scenario.mode === 'loading') await sleep(10 * 60 * 1000) // hold the skeleton for screenshots
    if (scenario.mode === 'empty') return jsonResp(200, store.emptyStatus())
    return jsonResp(200, store.status())
  }
  if (method === 'GET' && route === '/events-ring') return jsonResp(200, { events: store.ring() })
  if (method === 'POST' && (route === '/install' || route === '/update' || route === '/uninstall')) {
    const body = JSON.parse(init.body ?? '{}')
    const job = store.enqueueJob({
      type: route.slice(1),
      pack: body.pack ?? null,
      ids: body.ids ?? null,
      stepDelay: scenario.speed,
    })
    return jsonResp(202, { jobId: job.id })
  }
  if (method === 'POST' && route === '/enable') {
    const body = JSON.parse(init.body ?? '{}')
    return jsonResp(200, { ok: true, id: body.id, enabled: body.enabled !== false })
  }
  if (method === 'POST' && route === '/snapshot') {
    return jsonResp(200, { name: '20261001T130000-manual', files: ['package.json', 'pnpm-lock.yaml'] })
  }

  // ── channel (API-v2 §4) ──────────────────────────────────────────────────
  if (method === 'GET' && route === '/channel/status') {
    if (scenario.mode === 'error') return jsonResp(502, { error: 'simulated: suite backend offline' })
    if (scenario.channel === 'checking') await sleep(10 * 60 * 1000) // hold the spinner
    if (scenario.channel === 'offline') return jsonResp(200, store.channelStatus())
    return jsonResp(200, store.channelStatus())
  }
  if (method === 'POST' && route === '/channel/check') {
    if (scenario.channel === 'checking') await sleep(10 * 60 * 1000)
    return jsonResp(200, await store.checkChannel())
  }
  if (method === 'POST' && route === '/channel/config') {
    const body = JSON.parse(init.body ?? '{}')
    return jsonResp(200, store.saveConfig(body))
  }
  if (method === 'POST' && route === '/channel/apply') {
    const body = JSON.parse(init.body ?? '{}')
    const job = store.enqueueApply({ ids: body.ids ?? [], includeHeavy: !!body.includeHeavy, stepDelay: Math.min(scenario.speed, 300) })
    return jsonResp(202, { jobId: job.id })
  }

  // ── skin gallery (API-v2 §4) ─────────────────────────────────────────────
  if (method === 'GET' && route === '/skins/gallery') return jsonResp(200, GALLERY)
  if (method === 'GET' && route === '/prompts') {
    return jsonResp(200, GALLERY.skins.map((s) => ({ id: s.id, name: s.name, hasPrompt: Boolean(s.prompt) })))
  }
  const promptMatch = route.match(/^\/prompts\/([^/]+)$/)
  if (method === 'GET' && promptMatch) {
    const skin = GALLERY.skins.find((s) => s.id === decodeURIComponent(promptMatch[1]))
    if (!skin) return jsonResp(404, { error: `unknown prompt id ${promptMatch[1]}` })
    return jsonResp(200, { id: skin.id, manifest: manifestFor(skin), prompt: promptTextFor(skin) })
  }
  const assetMatch = route.match(/^\/asset\/previews\/([^/]+)\/(light|dark)\.(png|svg)$/)
  if (method === 'GET' && assetMatch) {
    const skin = GALLERY.skins.find((s) => s.id === decodeURIComponent(assetMatch[1]))
    // honour the "no preview" entries so the placeholder path is exercised
    if (!skin || !skin.previews) return jsonResp(404, { error: 'no preview' })
    await sleep(120) // simulate disk read
    return Promise.resolve(
      new Response(previewSvg(skin.id, assetMatch[2]), {
        status: 200,
        headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' },
      }),
    )
  }

  return jsonResp(404, { error: `[dev] no mock route ${method} ${route}` })
}

// ---------------------------------------------------------------------------
// ModuleLoader shim + mock require
// ---------------------------------------------------------------------------
const mockRequire = (name) => {
  if (name === 'react') return window.__DEV_REACT__
  throw new Error(`[dev] require('${name}') is not mocked — the client may only depend on 'react'`)
}

const modules = new Map()
window.__ModuleLoader__ = {
  load({ id, factory }) {
    const mod = factory(mockRequire)
    modules.set(id, mod)
    return mod
  },
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = resolve
    s.onerror = () => reject(new Error('[dev] failed to load ' + src))
    document.head.appendChild(s)
  })
}

// ---------------------------------------------------------------------------
// mock ctx — slots collect the registered settings tab; locale resolves the
// dictionaries the client registers through ctx.effect.
// ---------------------------------------------------------------------------
const localeState = { lang: scenario.lang, dicts: new Map() }
const fmt = (tpl, vars) => String(tpl ?? '').replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? ''))

const ctx = {
  effect: (fn) => fn(),
  locale: {
    register: (ns, dicts) => localeState.dicts.set(ns, dicts),
    // returns the raw template — the client's `fmt(t(x), vars)` applies vars
    bind: (ns) => (key, vars) => {
      const tpl = localeState.dicts.get(ns)?.[localeState.lang]?.[key] ?? key
      return vars === undefined ? tpl : fmt(tpl, vars)
    },
  },
  slots: {
    register: (def, component) => {
      const Comp = (props) => component(props)
      Comp._slotDef = def
      return Comp
    },
    inject: (name, fn) => {
      slots.set(name, fn())
      renderApp()
    },
  },
}

const slots = new Map()

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------
const appEl = document.getElementById('app')
let root = null
let mountKey = 0

function renderApp() {
  const Comp = slots.get('settings.plugins.tab')
  if (!Comp) {
    appEl.textContent = '[dev] no slot registered for settings.plugins.tab'
    return
  }
  root ??= createRoot(appEl)
  root.render(h(Comp, { key: mountKey }))
}

function remount() {
  mountKey++
  renderApp()
}

// ---------------------------------------------------------------------------
// dev control panel (plain DOM — never part of the shipped UI)
// ---------------------------------------------------------------------------
const panel = document.getElementById('dev-panel')
const GROUPS = [
  {
    label: '场景',
    options: [
      ['ready', '就绪'],
      ['loading', '加载中'],
      ['error', '错误'],
      ['empty', '空目录'],
    ],
    get: () => scenario.mode,
    set: (v) => {
      scenario.mode = v
      remount()
    },
  },
  {
    label: '渠道',
    options: [
      ['online', '在线'],
      ['offline', '离线'],
      ['checking', '检查中'],
    ],
    get: () => scenario.channel,
    set: (v) => {
      scenario.channel = v
      applyChannelScenario()
      remount()
    },
  },
  {
    label: '更新',
    options: [
      ['yes', '有更新'],
      ['no', '无更新'],
    ],
    get: () => (scenario.updates ? 'yes' : 'no'),
    set: (v) => {
      scenario.updates = v === 'yes'
      applyChannelScenario()
      remount()
    },
  },
  {
    label: '抽屉',
    options: [['open', '打开 miku']],
    get: () => '',
    set: () => openDrawer(),
  },
  {
    label: '语言',
    options: [
      ['zh', '中文'],
      ['en', 'EN'],
    ],
    get: () => localeState.lang,
    set: (v) => {
      localeState.lang = v
      scenario.lang = v
      remount()
    },
  },
  {
    label: '主题',
    options: [
      ['light', '亮'],
      ['dark', '暗'],
      ['system', '跟随系统'],
    ],
    get: () => scenario.theme,
    set: (v) => {
      scenario.theme = v
      applyTheme()
    },
  },
  {
    label: '安装速度',
    options: [
      [150, '正常'],
      [1400, '慢'],
    ],
    get: () => scenario.speed,
    set: (v) => {
      scenario.speed = Number(v)
    },
  },
]

/** Dev-panel helper: open the gallery tab, then click the miku card. */
function openDrawer() {
  const tabBtn = document.querySelector('[data-tab="gallery"]')
  if (tabBtn) tabBtn.click()
  setTimeout(() => {
    const card = document.querySelector('[data-skin-id="miku"]')
    if (card) card.click()
  }, 90)
}
window.__DEV_OPEN_DRAWER = openDrawer

function applyTheme() {
  const t = scenario.theme
  if (t === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = t
}

const groupEls = []

function buildPanel() {
  panel.innerHTML = ''
  const title = document.createElement('span')
  title.className = 'dp-title'
  title.textContent = `dsh-plugin-suite dev · scripted: fail=${SCRIPTED.fail} exempt=${SCRIPTED.exempt} warn=${SCRIPTED.warn}`
  panel.appendChild(title)

  for (const group of GROUPS) {
    const wrap = document.createElement('span')
    wrap.className = 'dp-group'
    const name = document.createElement('span')
    name.className = 'dp-label'
    name.textContent = group.label
    wrap.appendChild(name)
    for (const [value, text] of group.options) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'dp-btn'
      btn.textContent = text
      btn.dataset.value = String(value)
      btn.addEventListener('click', () => {
        group.set(value)
        syncPanel()
      })
      wrap.appendChild(btn)
    }
    groupEls.push({ group, wrap })
    panel.appendChild(wrap)
  }
  syncPanel()
}

function syncPanel() {
  for (const { group, wrap } of groupEls) {
    const current = String(group.get())
    for (const b of wrap.querySelectorAll('.dp-btn')) {
      b.classList.toggle('on', b.dataset.value === current)
    }
  }
}

// ---------------------------------------------------------------------------
// boot: load the real client bundle, then apply() it into the mock ctx
// ---------------------------------------------------------------------------
applyTheme()
buildPanel()

await loadScript('/client.js')
const mod = modules.get('dsh-plugin-suite')
if (!mod || typeof mod.apply !== 'function') {
  appEl.textContent = '[dev] client bundle loaded but exports no apply()'
} else {
  try {
    mod.apply(ctx)
  } catch (err) {
    appEl.textContent = '[dev] apply failed: ' + String(err?.stack ?? err)
  }
}
// dev probe: inspect the mock translator from the console / agent-browser eval
window.__DEV_T = ctx.locale.bind('settings.pluginSuite')
renderApp()
