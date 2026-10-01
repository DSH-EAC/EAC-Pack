/**
 * dsh-plugin-suite — browser half.
 *
 * Contributes one settings tab (`settings.plugins.tab` id `plugin-suite`) that
 * renders the EAC/AIO suite installer: pack cards, per-plugin list with status
 * badges, install / update / uninstall actions with live SSE progress.
 *
 * Data comes from this plugin's same-origin `/api/plugin-suite/*` routes, which
 * the Host half mounts on the shared web server. Hand-written ModuleLoader
 * bundle: no build step, the only dependency is the `react` the shell already
 * provides. All colour comes from theme variables so the page survives scheme
 * switches; motion is transform/opacity only and respects reduced-motion.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-suite',
  factory: require => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const { createElement: h, Fragment, useState, useEffect, useMemo, useRef, useCallback } = React

    const NS = 'settings.pluginSuite'
    const inject = ['slots', 'locale']
    const API = '/api/plugin-suite'

    // ── copy ──────────────────────────────────────────────────────────────────
    const DICT = {
      zh: {
        'meta.title': '插件整合包',
        'meta.description': '一键安装与更新 EAC / AIO 全量插件整合包',
        tab: '整合包',
        subtitle: 'EAC / AIO 全量插件整合包 · 一键安装 · 原地更新',
        refresh: '刷新',
        loading: '正在读取整合包目录…',
        loadFailed: '无法连接整合包后端',
        retry: '重试',
        emptyCatalog: '整合包目录为空：请使用随包发布的完整版本。',
        'pack.eac': 'EAC 全量包',
        'pack.eacHint': '揽尽万象主线全部在役插件',
        'pack.aio': 'AIO 精选包',
        'pack.aioHint': 'DSHEAC AIO 在役插件与运行时',
        'pack.skins': '皮肤（可选）',
        'pack.skinsHint': '10 款社区皮肤，默认不启用',
        installed: '{n}/{m} 已装',
        selectAll: '全选',
        invert: '反选',
        installSelected: '安装所选（{n}）',
        installAll: '一键安装',
        updateAll: '可更新 {n}',
        uninstallSelected: '移除所选',
        clickAgainConfirm: '再点一次确认',
        working: '任务进行中…',
        'status.installed': '已启用',
        'status.disabled': '已装未启用',
        'status.update': '可更新 {a} → {b}',
        'status.missing': '未安装',
        'tier.core': '功能',
        'tier.visual': '外观',
        'tier.heavy': '重型',
        disabledNote: '此插件在当前内核验证异常，默认保持关闭',
        unavailableNote: '上游不可得，本包跳过',
        'progress.title': '安装进度',
        'progress.idle': '暂无任务',
        log: '实时日志',
        logShow: '展开',
        logHide: '收起',
        snapshot: '安装前已自动快照：{name}',
        confirmUninstall: '移除后插件将在重启后彻底消失，确定移除所选吗？',
        noSelection: '请先勾选要处理的插件',
        needRestart: '版本替换需重启应用后完全生效',
      },
      en: {
        'meta.title': 'Plugin Suite',
        'meta.description': 'One-click install and update for the EAC / AIO plugin suites',
        tab: 'Suite',
        subtitle: 'Full EAC / AIO plugin suites · one-click install · in-place update',
        refresh: 'Refresh',
        loading: 'Loading suite catalog…',
        loadFailed: 'Cannot reach the suite backend',
        retry: 'Retry',
        emptyCatalog: 'Suite catalog is empty: use the full release build.',
        'pack.eac': 'EAC Full Pack',
        'pack.eacHint': 'Every active plugin from the EAC main line',
        'pack.aio': 'AIO Curated Pack',
        'pack.aioHint': 'Active DSHEAC AIO plugins and runtime bundles',
        'pack.skins': 'Skins (optional)',
        'pack.skinsHint': '10 community skins, disabled by default',
        installed: '{n}/{m} installed',
        selectAll: 'Select all',
        invert: 'Invert',
        installSelected: 'Install selected ({n})',
        installAll: 'Install all',
        updateAll: '{n} updates',
        uninstallSelected: 'Remove selected',
        clickAgainConfirm: 'Click again to confirm',
        working: 'A job is running…',
        'status.installed': 'Enabled',
        'status.disabled': 'Installed, disabled',
        'status.update': 'Update {a} → {b}',
        'status.missing': 'Not installed',
        'tier.core': 'Core',
        'tier.visual': 'Visual',
        'tier.heavy': 'Heavy',
        disabledNote: 'This plugin misbehaves on the current kernel and stays disabled by default',
        unavailableNote: 'Upstream unavailable, skipped by this pack',
        'progress.title': 'Progress',
        'progress.idle': 'No job yet',
        log: 'Live log',
        logShow: 'Show',
        logHide: 'Hide',
        snapshot: 'Profile snapshotted automatically: {name}',
        confirmUninstall: 'Removed plugins disappear after a restart. Remove the selection?',
        noSelection: 'Select at least one plugin first',
        needRestart: 'Version replacement fully applies after an app restart',
      },
    }

    // ── style ─────────────────────────────────────────────────────────────────
    const CSS = `
.suite-root { color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 1.5; max-width: 860px; }
.suite-head { display: flex; align-items: baseline; gap: 10px; margin: 2px 0 14px; }
.suite-title { font-size: 16px; font-weight: 650; }
.suite-sub { color: var(--dsw-alias-label-tertiary); font-size: 12px; flex: 1; min-width: 0; }
.suite-btn { appearance: none; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); border-radius: 8px; padding: 5px 12px; font-size: 12px; cursor: pointer; transition: background .18s ease, border-color .18s ease, transform .12s ease, opacity .18s ease; }
.suite-btn:hover { background: var(--dsw-alias-bg-layer-3); }
.suite-btn:active { transform: scale(.97); }
.suite-btn:disabled { opacity: .45; cursor: not-allowed; transform: none; }
.suite-btn.primary { background: var(--dsw-alias-state-business-primary); border-color: transparent; color: var(--dsw-alias-label-on-accent); }
.suite-btn.primary:hover { filter: brightness(1.06); }
.suite-btn.danger { color: var(--dsw-alias-state-error-primary); }
.suite-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin-bottom: 14px; }
.suite-card { text-align: left; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 12px; padding: 12px 14px; cursor: pointer; transition: border-color .2s ease, background .2s ease, transform .18s ease, box-shadow .2s ease; animation: suite-rise .38s cubic-bezier(.22,1,.36,1) backwards; }
.suite-card:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(0,0,0,.08); border-color: var(--dsw-alias-border-l2); }
.suite-card.active { border-color: var(--dsw-alias-state-business-primary); background: var(--dsw-alias-bg-layer-2); box-shadow: 0 0 0 1px var(--dsw-alias-state-business-primary) inset; }
.suite-card .name { font-weight: 650; font-size: 13.5px; }
.suite-card .hint { color: var(--dsw-alias-label-tertiary); font-size: 11.5px; margin-top: 2px; }
.suite-meter { height: 4px; border-radius: 2px; background: var(--dsw-alias-bg-layer-3); margin-top: 9px; overflow: hidden; }
.suite-meter > i { display: block; height: 100%; border-radius: 2px; background: var(--dsw-alias-state-business-primary); transition: width .45s cubic-bezier(.22,1,.36,1); }
.suite-meter .full { background: var(--dsw-alias-state-success-primary); }
.suite-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 2px 0 10px; }
.suite-count { color: var(--dsw-alias-label-tertiary); font-size: 11.5px; margin-right: auto; }
.suite-list { display: flex; flex-direction: column; border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); overflow: hidden; }
.suite-row { display: flex; align-items: center; gap: 10px; padding: 9px 14px; border-top: 1px solid var(--dsw-alias-border-l1); transition: background .15s ease; animation: suite-rise .34s cubic-bezier(.22,1,.36,1) backwards; }
.suite-row:first-child { border-top: none; }
.suite-row:hover { background: var(--dsw-alias-bg-layer-2); }
.suite-row .title { font-weight: 550; }
.suite-row .desc { color: var(--dsw-alias-label-tertiary); font-size: 11.5px; }
.suite-row .main { flex: 1; min-width: 0; }
.suite-row .main > .desc { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.suite-badge { flex: none; font-size: 10.5px; border-radius: 999px; padding: 2px 8px; border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.suite-badge.ok { color: var(--dsw-alias-state-success-primary); border-color: transparent; background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent); }
.suite-badge.off { color: var(--dsw-alias-label-tertiary); }
.suite-badge.upd { color: var(--dsw-alias-state-warning-primary); border-color: transparent; background: color-mix(in srgb, var(--dsw-alias-state-warning-primary) 12%, transparent); }
.suite-badge.heavy { color: var(--dsw-alias-state-warning-primary); }
.suite-badge.visual { color: var(--dsw-alias-state-business-primary); }
.suite-check { flex: none; width: 15px; height: 15px; accent-color: var(--dsw-alias-state-business-primary); cursor: pointer; }
.suite-progress { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); border-radius: 12px; padding: 10px 14px; margin-bottom: 12px; animation: suite-rise .3s ease backwards; }
.suite-progress .line { display: flex; align-items: center; gap: 8px; }
.suite-progress .bar { height: 4px; flex: 1; border-radius: 2px; background: var(--dsw-alias-bg-layer-3); overflow: hidden; }
.suite-progress .bar > i { display: block; height: 100%; background: var(--dsw-alias-state-business-primary); border-radius: 2px; transition: width .4s cubic-bezier(.22,1,.36,1); }
.suite-progress.log { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; max-height: 180px; overflow: auto; white-space: pre-wrap; color: var(--dsw-alias-label-secondary); }
.suite-progress.log .ok { color: var(--dsw-alias-state-success-primary); }
.suite-progress.log .fail { color: var(--dsw-alias-state-error-primary); }
.suite-skel { border-radius: 12px; border: 1px solid var(--dsw-alias-border-l1); padding: 12px 14px; margin-bottom: 8px; background: linear-gradient(100deg, var(--dsw-alias-bg-layer-1) 40%, var(--dsw-alias-bg-layer-3) 50%, var(--dsw-alias-bg-layer-1) 60%); background-size: 200% 100%; animation: suite-shimmer 1.4s infinite linear; }
.suite-err { color: var(--dsw-alias-state-error-primary); }
.suite-note { color: var(--dsw-alias-label-tertiary); font-size: 11.5px; margin-top: 10px; }
.suite-spin { width: 12px; height: 12px; flex: none; border-radius: 50%; border: 2px solid var(--dsw-alias-border-l2); border-top-color: var(--dsw-alias-state-business-primary); animation: suite-spin .8s linear infinite; }
@keyframes suite-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes suite-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
@keyframes suite-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .suite-root * { animation: none !important; transition: none !important; } }
`

    // ── helpers ───────────────────────────────────────────────────────────────
    const fmt = (tpl, vars) => String(tpl ?? '').replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? ''))

    async function api(path, options) {
      const res = await fetch(API + path, options)
      if (!res.ok) {
        let detail = ''
        try { detail = (await res.json())?.error ?? '' } catch { /* non-json */ }
        throw new Error(detail || `${res.status} ${res.statusText}`)
      }
      return res.json()
    }

    function statusOf(item) {
      if (item.installed && item.updateAvailable) return 'update'
      if (item.installed && item.enabled !== false) return 'installed'
      if (item.installed) return 'disabled'
      return 'missing'
    }

    // ── components ────────────────────────────────────────────────────────────
    function Skel() {
      return h('div', null, [0, 1, 2].map(i => h('div', { key: i, className: 'suite-skel', style: { height: 42 } })))
    }

    function PackCard({ pack, active, onClick, t, delay }) {
      const total = pack.items.length
      const installed = pack.items.filter(it => it.installed).length
      const pct = total ? Math.round((installed / total) * 100) : 0
      return h('button', {
        className: 'suite-card' + (active ? ' active' : ''),
        style: { animationDelay: `${delay}ms` },
        onClick,
      },
        h('div', { className: 'name' }, t('pack.' + pack.id)),
        h('div', { className: 'hint' }, t('pack.' + pack.id + 'Hint')),
        h('div', { className: 'meter suite-meter' },
          h('i', { className: pct === 100 ? 'full' : '', style: { width: pct + '%' } })),
        h('div', { className: 'hint' }, fmt(t('installed'), { n: installed, m: total })),
      )
    }

    function Row({ item, index, checked, onCheck, t }) {
      const st = statusOf(item)
      const badge = {
        installed: { cls: 'ok', text: t('status.installed') },
        disabled: { cls: 'off', text: t('status.disabled') },
        update: { cls: 'upd', text: fmt(t('status.update'), { a: item.installedVersion, b: item.version }) },
        missing: { cls: '', text: t('status.missing') },
      }[st]
      return h('label', { className: 'suite-row', style: { animationDelay: `${Math.min(index * 22, 440)}ms` } },
        h('input', { type: 'checkbox', className: 'suite-check', checked, onChange: e => onCheck(item.id, e.target.checked) }),
        h('div', { className: 'main' },
          h('div', { className: 'title' }, item.titleZh || item.name),
          h('div', { className: 'desc' }, item.descZh || item.name),
        ),
        item.tier !== 'core' && h('span', { className: 'suite-badge ' + item.tier }, t('tier.' + item.tier)),
        item.installedVersion && h('span', { className: 'suite-badge off' }, item.installedVersion),
        h('span', { className: 'suite-badge ' + badge.cls }, badge.text),
      )
    }

    function ProgressPanel({ events, job, t }) {
      const [open, setOpen] = useState(false)
      const logRef = useRef(null)
      useEffect(() => { if (open && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [events, open])
      const lines = events.slice(-120)
      return h('div', { className: 'suite-progress' },
        h('div', { className: 'line' },
          job ? h('span', { className: 'suite-spin' }) : null,
          h('b', null, job ? t('progress.title') : t('progress.idle')),
          job ? h('span', { className: 'suite-count' }, t('working')) : null,
          h('span', { style: { marginLeft: 'auto' } },
            h('button', { className: 'suite-btn', onClick: () => setOpen(o => !o) }, open ? t('logHide') : t('logShow')))),
        job && h('div', { className: 'bar', style: { marginTop: 8 } },
          h('i', { style: { width: (job.pct ?? 0) + '%' } })),
        open && h('div', { className: 'log', ref: logRef },
          lines.length === 0 ? t('progress.idle') : lines.map((e, i) =>
            h('div', { key: i, className: e.type === 'step-fail' ? 'fail' : e.type === 'step-ok' ? 'ok' : '' },
              `[${new Date(e.ts).toLocaleTimeString()}] ${e.type}: ${[e.id, e.message, e.pack && `pack=${e.pack}`, e.snapshot && fmt(t('snapshot'), { name: e.snapshot })].filter(Boolean).join(' ')}`))),
      )
    }

    function SuiteTab() {
      const [state, setState] = useState({ phase: 'loading', data: null, error: null })
      const [packId, setPackId] = useState('eac')
      const [checked, setChecked] = useState(() => new Set())
      const [events, setEvents] = useState([])
      const [job, setJob] = useState(null)
      const [confirmArm, setConfirmArm] = useState(false)
      const [notice, setNotice] = useState('')

      const load = useCallback(async () => {
        setState(s => ({ ...s, phase: 'loading' }))
        try {
          const data = await api('/status')
          setEvents(await api('/events-ring').then(r => r.events).catch(() => []))
          setState({ phase: 'ready', data, error: null })
        } catch (err) {
          setState({ phase: 'error', data: null, error: String(err.message ?? err) })
        }
      }, [])

      useEffect(() => { load() }, [load])

      // live progress over SSE; the stream replays the recent ring on connect
      useEffect(() => {
        let es
        try {
          es = new EventSource(API + '/events')
          const seen = new Set()
          const onEvent = (msg) => {
            const e = JSON.parse(msg.data)
            if (e.type === 'job-start') {
              seen.clear()
              setJob({ pack: e.pack, total: e.total, done: 0, pct: 0, snapshot: e.snapshot })
              setEvents(prev => [...prev, e])
            } else if (e.type?.startsWith('step-')) {
              setEvents(prev => [...prev.slice(-400), e])
              setJob(j => {
                if (!j || e.type === 'step-warn') return j
                const done = j.done + (e.type === 'step-ok' || e.type === 'step-fail' ? 1 : 0)
                return { ...j, done, pct: j.total ? Math.round((done / j.total) * 100) : 0 }
              })
            } else if (e.type === 'job-done') {
              setJob(j => (j ? { ...j, pct: 100 } : j))
              setEvents(prev => [...prev.slice(-400), e])
              setTimeout(() => { setJob(null); load() }, 900)
            }
          }
          es.onmessage = onEvent
        } catch { /* SSE unavailable: install still works, feedback via refresh */ }
        return () => es?.close?.()
      }, [load])

      // real translator injected by apply() wrapper (falls back to zh dict)
      const tr = SuiteTab._t ?? ((x, vars) => fmt((DICT.zh[x] ?? x), vars))

      const data = state.data
      const packs = data ? ['eac', 'aio', 'skins'].map(id => ({ id, items: data.packs[id] ?? [] })) : []
      const current = packs.find(p => p.id === packId) ?? packs[0]
      const selected = current ? current.items.filter(it => checked.has(it.id)) : []
      const updatable = data ? Object.values(data.packs).flat().filter(it => it.updateAvailable) : []
      const busy = Boolean(job)

      const toggle = (id, on) => setChecked(prev => {
        const next = new Set(prev)
        if (on) next.add(id)
        else next.delete(id)
        return next
      })

      const runInstall = async () => {
        if (!selected.length) return setNotice(tr('noSelection'))
        setNotice('')
        try {
          await api('/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pack: packId, ids: selected.map(i => i.id) }) })
        } catch (err) { setNotice(String(err.message ?? err)) }
      }
      const runInstallAll = async () => {
        if (!current?.items.length) return
        setNotice('')
        try {
          await api('/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pack: packId }) })
        } catch (err) { setNotice(String(err.message ?? err)) }
      }
      const runUpdate = async () => {
        setNotice('')
        try { await api('/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: updatable.map(i => i.id) }) }) }
        catch (err) { setNotice(String(err.message ?? err)) }
      }
      const runUninstall = async () => {
        if (!selected.length) return setNotice(tr('noSelection'))
        if (!confirmArm) { setConfirmArm(true); setTimeout(() => setConfirmArm(false), 3000); return }
        setConfirmArm(false)
        setNotice('')
        try {
          await api('/uninstall', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selected.map(i => i.id) }) })
        } catch (err) { setNotice(String(err.message ?? err)) }
      }

      if (state.phase === 'loading') return h('div', { className: 'suite-root' }, h(Skel))
      if (state.phase === 'error') {
        return h('div', { className: 'suite-root' },
          h('div', { className: 'suite-head' }, h('span', { className: 'suite-title' }, tr('meta.title'))),
          h('div', { className: 'suite-err' }, `${tr('loadFailed')}: ${state.error}`),
          h('div', { style: { marginTop: 10 } }, h('button', { className: 'suite-btn', onClick: load }, tr('retry'))))
      }
      return h('div', { className: 'suite-root' },
        h('style', null, CSS),
        h('div', { className: 'suite-head' },
          h('span', { className: 'suite-title' }, tr('meta.title')),
          h('span', { className: 'suite-sub' }, tr('subtitle') + (data?.suiteVersion ? ` · v${data.suiteVersion}` : '')),
          h('button', { className: 'suite-btn', onClick: load, disabled: busy }, tr('refresh'))),
        h(ProgressPanel, { events, job, t: tr }),
        h('div', { className: 'suite-cards' },
          packs.map((p, i) => h(PackCard, { key: p.id, pack: p, active: p.id === packId, onClick: () => { setPackId(p.id); setChecked(new Set()) }, t: tr, delay: i * 60 }))),
        current && h(Fragment, null,
          h('div', { className: 'suite-toolbar' },
            h('span', { className: 'suite-count' },
              `${fmt(tr('installed'), { n: current.items.filter(i => i.installed).length, m: current.items.length })} · ${current.items.filter(i => i.defaultEnabled === false).length} 默认禁用`),
            h('button', { className: 'suite-btn', onClick: () => setChecked(new Set(current.items.map(i => i.id))) }, tr('selectAll')),
            h('button', { className: 'suite-btn', onClick: () => setChecked(new Set(current.items.filter(i => !checked.has(i.id)).map(i => i.id))) }, tr('invert')),
            h('button', { className: 'suite-btn primary', onClick: runInstallAll, disabled: busy }, tr('installAll')),
            selected.length > 0 && h('button', { className: 'suite-btn primary', onClick: runInstall, disabled: busy }, fmt(tr('installSelected'), { n: selected.length })),
            updatable.length > 0 && h('button', { className: 'suite-btn', onClick: runUpdate, disabled: busy }, fmt(tr('updateAll'), { n: updatable.length })),
            h('button', { className: 'suite-btn danger', onClick: runUninstall, disabled: busy }, confirmArm ? tr('clickAgainConfirm') : tr('uninstallSelected'))),
          notice && h('div', { className: 'suite-err', style: { marginBottom: 8 } }, notice),
          h('div', { className: 'suite-list' },
            current.items.map((item, i) => h(Row, { key: item.id, item, index: i, checked: checked.has(item.id), onCheck: toggle, t: tr }))),
          h('div', { className: 'suite-note' }, tr('needRestart')),
        ),
        current && current.items.length === 0 && h('div', { className: 'suite-note' }, tr('emptyCatalog')),
      )
    }

    // ── apply ─────────────────────────────────────────────────────────────────
    function apply(ctx) {
      const t = ctx.locale?.bind?.(NS) ?? (x => x)
      SuiteTab._t = (x, vars) => fmt(t(x), vars)
      ctx.effect?.(() => ctx.locale?.register?.(NS, { zh: DICT.zh, en: DICT.en }), 'plugin-suite: dictionaries')

      ctx.slots?.inject?.('settings.plugins.tab', () => ctx.slots.register({
        name: 'settings.plugins.tab',
        id: 'plugin-suite',
        order: 5,
        label: () => t('tab'),
        locale: NS,
      }, props => h(SuiteTab, props)))
    }

    exports.apply = apply
    exports.inject = inject
    exports.name = 'plugin-suite'
    return module.exports
  },
})
