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
        'error.hint': '请确认整合包宿主半已在内核中启动，然后重试。',
        retry: '重试',
        emptyCatalog: '整合包目录为空：请使用随包发布的完整版本。',
        'empty.title': '这个包暂无可安装的插件',
        'empty.hint': '目录为空通常意味着使用的是精简构建：请换用随包发布的完整版本。',
        'pack.eac': 'EAC 全量包',
        'pack.eacHint': '揽尽万象主线全部在役插件',
        'pack.aio': 'AIO 全量包',
        'pack.aioHint': 'AIO 6.9.3 全部 11 项 + 稳定线 v1.2.0 增补 8 项，无遗漏',
        'pack.skins': '皮肤（可选）',
        'pack.skinsHint': '10 款社区皮肤，默认不启用',
        installed: '{n}/{m} 已装',
        installedShort: '已装',
        defaultDisabled: '{n} 默认禁用',
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
        'progress.done': '任务完成：成功 {ok} · 失败 {failed}',
        'job.install': '安装',
        'job.update': '更新',
        'job.uninstall': '移除',
        'log.empty': '暂无日志',
        log: '实时日志',
        logShow: '展开日志',
        logHide: '收起日志',
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
        'error.hint': 'Make sure the suite host half is running in the kernel, then retry.',
        retry: 'Retry',
        emptyCatalog: 'Suite catalog is empty: use the full release build.',
        'empty.title': 'Nothing to install in this pack',
        'empty.hint': 'An empty catalog usually means a slim build: use the full release package.',
        'pack.eac': 'EAC Full Pack',
        'pack.eacHint': 'Every active plugin from the EAC main line',
        'pack.aio': 'AIO Full Pack',
        'pack.aioHint': 'All 11 plugins from AIO 6.9.3 + 8 from the v1.2.0 stable line',
        'pack.skins': 'Skins (optional)',
        'pack.skinsHint': '10 community skins, disabled by default',
        installed: '{n}/{m} installed',
        installedShort: 'Installed',
        defaultDisabled: '{n} default-off',
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
        'progress.done': 'Job finished: {ok} ok · {failed} failed',
        'job.install': 'Install',
        'job.update': 'Update',
        'job.uninstall': 'Remove',
        'log.empty': 'No log lines yet',
        log: 'Live log',
        logShow: 'Show log',
        logHide: 'Hide log',
        snapshot: 'Profile snapshotted automatically: {name}',
        confirmUninstall: 'Removed plugins disappear after a restart. Remove the selection?',
        noSelection: 'Select at least one plugin first',
        needRestart: 'Version replacement fully applies after an app restart',
      },
    }

    // ── style ─────────────────────────────────────────────────────────────────
    // Colour: shell alias variables only. Motion: transform/opacity only,
    // backed by a prefers-reduced-motion kill switch.
    const CSS = `
.suite-root { color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 1.5; max-width: 860px; }
.suite-root button { font-family: inherit; }
.suite-root :focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }

.suite-head { display: flex; align-items: baseline; gap: 10px; margin: 2px 0 14px; }
.suite-title { font-size: 16px; font-weight: 650; }
.suite-version { flex: none; font-size: 10.5px; line-height: 1; padding: 3px 7px; border-radius: 999px; background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-tertiary); transform: translateY(-2px); }
.suite-sub { color: var(--dsw-alias-label-tertiary); font-size: 12px; flex: 1; min-width: 0; }

.suite-btn { appearance: none; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); border-radius: 8px; padding: 5px 12px; font-size: 12px; cursor: pointer; transition: background .18s ease, border-color .18s ease, transform .12s ease, opacity .18s ease, color .18s ease; }
.suite-btn:hover { background: var(--dsw-alias-bg-layer-3); }
.suite-btn:active { transform: scale(.97); }
.suite-btn:disabled { opacity: .45; cursor: not-allowed; transform: none; }
.suite-btn.primary { background: var(--dsw-alias-state-business-primary); border-color: transparent; color: var(--dsw-alias-label-on-accent); }
.suite-btn.primary:hover { filter: brightness(1.06); background: var(--dsw-alias-state-business-primary); }
/* danger red is reserved for the remove action */
.suite-btn.danger { color: var(--dsw-alias-state-error-primary); }
.suite-btn.danger.armed { background: var(--dsw-alias-state-error-primary); border-color: transparent; color: var(--dsw-alias-label-on-accent); animation: suite-pulse .9s ease infinite; }

/* ── pack cards ── */
.suite-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--gap, 10px); margin-bottom: 14px; }
.suite-card { position: relative; text-align: left; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 12px; padding: 12px 14px; cursor: pointer; color: inherit; transition: border-color .2s ease, background .2s ease, transform .18s ease, box-shadow .2s ease; animation: suite-rise .38s cubic-bezier(.22,1,.36,1) backwards; }
.suite-card:hover { transform: translateY(-1px); box-shadow: 0 6px 18px color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent); border-color: var(--dsw-alias-border-l2); }
.suite-card.active { border-color: var(--dsw-alias-state-business-primary); background: var(--dsw-alias-bg-layer-2); box-shadow: 0 0 0 1px var(--dsw-alias-state-business-primary) inset; }
.suite-card .card-top { display: flex; align-items: center; gap: 8px; }
.suite-card .name { font-weight: 650; font-size: 13.5px; flex: 1; min-width: 0; }
.suite-card .count { flex: none; font-size: 10.5px; line-height: 1; padding: 3px 7px; border-radius: 999px; background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-secondary); }
.suite-card.active .count { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent); color: var(--dsw-alias-state-business-primary); }
.suite-card .hint { color: var(--dsw-alias-label-tertiary); font-size: 11.5px; margin-top: 2px; }
.suite-meter { height: 4px; border-radius: 2px; background: var(--dsw-alias-bg-layer-3); margin-top: 10px; overflow: hidden; }
.suite-meter > i { display: block; height: 100%; border-radius: 2px; background: var(--dsw-alias-state-business-primary); transform-origin: 0 50%; transform: scaleX(0); transition: transform .5s cubic-bezier(.22,1,.36,1); }
.suite-meter > i.full { background: var(--dsw-alias-state-success-primary); }
.suite-card .meter-caption { display: flex; align-items: baseline; gap: 8px; margin-top: 5px; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.suite-card .meter-caption .pct { margin-left: auto; font-variant-numeric: tabular-nums; }

/* ── toolbar ── */
.suite-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 2px 0 10px; }
.suite-count { color: var(--dsw-alias-label-tertiary); font-size: 11.5px; margin-right: auto; }

/* ── notice ── */
.suite-notice { display: flex; align-items: center; gap: 8px; border-radius: 8px; padding: 6px 10px; font-size: 12px; margin-bottom: 8px; animation: suite-rise .22s ease backwards; }
.suite-notice.warn { color: var(--dsw-alias-state-warning-primary); background: color-mix(in srgb, var(--dsw-alias-state-warning-primary) 10%, transparent); }
.suite-notice.err { color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent); }

/* ── plugin list ── */
.suite-list { display: flex; flex-direction: column; border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); overflow: hidden; }
.suite-row { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-top: 1px solid var(--dsw-alias-border-l1); transition: background .15s ease; animation: suite-rise .34s cubic-bezier(.22,1,.36,1) backwards; cursor: pointer; }
.suite-row:first-child { border-top: none; }
.suite-row:hover { background: var(--dsw-alias-bg-layer-2); }
.suite-row.checked { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 6%, transparent); }
.suite-row .main { flex: 1; min-width: 0; }
.suite-row .title-line { display: flex; align-items: center; gap: 6px; min-width: 0; }
.suite-row .title { font-weight: 550; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.suite-row .desc { color: var(--dsw-alias-label-tertiary); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.suite-row .side { flex: none; display: flex; align-items: center; gap: 6px; }
.suite-check { flex: none; width: 15px; height: 15px; margin: 0; accent-color: var(--dsw-alias-state-business-primary); cursor: pointer; }

/* ── badge system: tier = what it is, status = where it stands ── */
.suite-badge { flex: none; display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; line-height: 1.2; border-radius: 999px; padding: 2.5px 8px; border: 1px solid transparent; white-space: nowrap; }
.suite-badge.tier { color: var(--dsw-alias-label-tertiary); border-color: var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); }
.suite-badge.tier-visual { color: var(--dsw-alias-state-business-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 28%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 9%, transparent); }
.suite-badge.tier-heavy { color: var(--dsw-alias-state-warning-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-warning-primary) 28%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-warning-primary) 9%, transparent); }
.suite-badge.ver { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10px; color: var(--dsw-alias-label-tertiary); border-color: var(--dsw-alias-border-l1); }
.suite-badge.st-installed { color: var(--dsw-alias-state-success-primary); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 11%, transparent); }
.suite-badge.st-disabled { color: var(--dsw-alias-label-tertiary); border-color: var(--dsw-alias-border-l2); }
.suite-badge.st-update { color: var(--dsw-alias-state-warning-primary); background: color-mix(in srgb, var(--dsw-alias-state-warning-primary) 11%, transparent); }
.suite-badge.st-missing { color: var(--dsw-alias-label-tertiary); border-style: dashed; border-color: var(--dsw-alias-border-l2); }

/* ── progress panel ── */
.suite-progress { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); border-radius: 12px; padding: 10px 14px; margin-bottom: 12px; animation: suite-rise .3s ease backwards; }
.suite-progress .line { display: flex; align-items: center; gap: 8px; }
.suite-progress .line b { font-weight: 600; }
.suite-progress .job-meta { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; color: var(--dsw-alias-label-tertiary); font-size: 11.5px; font-variant-numeric: tabular-nums; }
.suite-progress .bar { height: 4px; margin-top: 8px; border-radius: 2px; background: var(--dsw-alias-bg-layer-3); overflow: hidden; }
.suite-progress .bar > i { display: block; height: 100%; border-radius: 2px; background: var(--dsw-alias-state-business-primary); transform-origin: 0 50%; transform: scaleX(0); transition: transform .45s cubic-bezier(.22,1,.36,1); }
.suite-progress .bar > i.done-ok { background: var(--dsw-alias-state-success-primary); }
.suite-progress .snapshot { margin-top: 7px; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.suite-progress .latest { display: flex; align-items: center; gap: 7px; margin-top: 8px; font-size: 12px; min-width: 0; }
.suite-progress .latest .dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-label-tertiary); }
.suite-progress .latest.lv-start .dot { background: var(--dsw-alias-state-business-primary); }
.suite-progress .latest.lv-ok .dot { background: var(--dsw-alias-state-success-primary); }
.suite-progress .latest.lv-warn .dot { background: var(--dsw-alias-state-warning-primary); }
.suite-progress .latest.lv-fail .dot { background: var(--dsw-alias-state-error-primary); }
.suite-progress .latest.lv-done .dot { background: var(--dsw-alias-state-success-primary); }
.suite-progress .latest.lv-warn { color: var(--dsw-alias-state-warning-primary); }
.suite-progress .latest.lv-fail { color: var(--dsw-alias-state-error-primary); }
.suite-progress .latest .txt { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.suite-progress .log { margin-top: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; max-height: 190px; overflow: auto; white-space: pre-wrap; color: var(--dsw-alias-label-secondary); border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 8px; }
.suite-progress .log .t { color: var(--dsw-alias-label-tertiary); }
.suite-progress .log .ok { color: var(--dsw-alias-state-success-primary); }
.suite-progress .log .warn { color: var(--dsw-alias-state-warning-primary); }
.suite-progress .log .fail { color: var(--dsw-alias-state-error-primary); }
.suite-progress .log .start { color: var(--dsw-alias-state-business-primary); }
.suite-progress .log .dim { color: var(--dsw-alias-label-tertiary); }

/* ── skeleton / error / empty ── */
.suite-skel { position: relative; overflow: hidden; border-radius: 12px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
.suite-skel::after { content: ''; position: absolute; inset: 0; transform: translateX(-100%); background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent), transparent); animation: suite-sweep 1.4s ease-in-out infinite; }
.suite-skel.card { width: auto; }
.suite-skel.bar { border-radius: 8px; margin-bottom: 10px; }
.suite-skel.row { border-radius: 0; border-left: none; border-right: none; border-bottom: none; }
.suite-errbox { border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 7%, transparent); border-radius: 12px; padding: 22px 18px; text-align: center; animation: suite-rise .3s ease backwards; }
.suite-errbox .big { margin-bottom: 8px; }
.suite-errbox .err-title { font-weight: 650; color: var(--dsw-alias-state-error-primary); }
.suite-errbox .err-detail { margin-top: 4px; color: var(--dsw-alias-label-secondary); font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow-wrap: anywhere; }
.suite-errbox .err-hint { margin-top: 6px; color: var(--dsw-alias-label-tertiary); font-size: 11.5px; }
.suite-errbox .suite-btn { margin-top: 14px; }
.suite-empty { border: 1.5px dashed var(--dsw-alias-border-l2); border-radius: 12px; padding: 30px 18px; text-align: center; color: var(--dsw-alias-label-tertiary); animation: suite-rise .3s ease backwards; }
.suite-empty .empty-title { color: var(--dsw-alias-label-secondary); font-weight: 550; }
.suite-empty .empty-hint { margin-top: 4px; font-size: 11.5px; }

.suite-note { color: var(--dsw-alias-label-tertiary); font-size: 11.5px; margin-top: 10px; }
.suite-spin { width: 12px; height: 12px; flex: none; border-radius: 50%; border: 2px solid var(--dsw-alias-border-l2); border-top-color: var(--dsw-alias-state-business-primary); animation: suite-spin .8s linear infinite; }
.suite-idledot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-border-l2); }

@keyframes suite-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes suite-sweep { to { transform: translateX(100%); } }
@keyframes suite-spin { to { transform: rotate(360deg); } }
@keyframes suite-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .75; } }
@media (prefers-reduced-motion: reduce) {
  .suite-root *, .suite-root *::after { animation: none !important; transition: none !important; }
}
`

    // small inline icons (stroke follows currentColor)
    const Icon = {
      error: () => h('svg', { className: 'big', width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true },
        h('circle', { cx: 12, cy: 12, r: 9, stroke: 'currentColor', 'stroke-width': 1.6 }),
        h('path', { d: 'M12 7.5v5.5', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round' }),
        h('circle', { cx: 12, cy: 16.4, r: 1.05, fill: 'currentColor' })),
      empty: () => h('svg', { className: 'big', width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M4 7.5 12 4l8 3.5v9L12 20l-8-3.5v-9Z', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }),
        h('path', { d: 'M4 7.5 12 11l8-3.5M12 11v9', stroke: 'currentColor', 'stroke-width': 1.2, opacity: .55 })),
    }

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
      return h(Fragment, null,
        h('div', { className: 'suite-cards' },
          [0, 1, 2].map(i => h('div', { key: i, className: 'suite-skel card', style: { height: 88, animationDelay: `${i * 80}ms` } }))),
        h('div', { className: 'suite-skel bar', style: { height: 36 } }),
        h('div', { className: 'suite-list' },
          [0, 1, 2, 3, 4, 5].map(i => h('div', { key: i, className: 'suite-skel row', style: { height: 46, animationDelay: `${i * 60}ms` } }))),
      )
    }

    function PackCard({ pack, active, onClick, t, delay }) {
      const total = pack.items.length
      const installed = pack.items.filter(it => it.installed).length
      const pct = total ? Math.round((installed / total) * 100) : 0
      return h('button', {
        type: 'button',
        className: 'suite-card' + (active ? ' active' : ''),
        style: { animationDelay: `${delay}ms` },
        onClick,
        'aria-pressed': active,
      },
        h('div', { className: 'card-top' },
          h('span', { className: 'name' }, t('pack.' + pack.id)),
          h('span', { className: 'count' }, `${installed}/${total}`)),
        h('div', { className: 'hint' }, t('pack.' + pack.id + 'Hint')),
        h('div', { className: 'meter suite-meter' },
          h('i', { className: pct === 100 ? 'full' : '', style: { transform: `scaleX(${pct / 100})` } })),
        h('div', { className: 'meter-caption' },
          h('span', null, t('installedShort')),
          h('span', { className: 'pct' }, `${pct}%`)),
      )
    }

    function Row({ item, index, checked, onCheck, t }) {
      const st = statusOf(item)
      const badge = {
        installed: { cls: 'st-installed', text: t('status.installed') },
        disabled: { cls: 'st-disabled', text: t('status.disabled') },
        update: { cls: 'st-update', text: fmt(t('status.update'), { a: item.installedVersion, b: item.version }) },
        missing: { cls: 'st-missing', text: t('status.missing') },
      }[st]
      return h('label', {
        className: 'suite-row' + (checked ? ' checked' : ''),
        style: { animationDelay: `${Math.min(index * 18, 360)}ms` },
      },
        h('input', {
          type: 'checkbox', className: 'suite-check', checked,
          onChange: e => onCheck(item.id, e.target.checked),
        }),
        h('div', { className: 'main' },
          h('div', { className: 'title-line' },
            h('span', { className: 'title' }, item.titleZh || item.name),
            h('span', { className: 'suite-badge tier tier-' + item.tier }, t('tier.' + item.tier))),
          h('div', { className: 'desc' }, item.descZh || item.name)),
        h('div', { className: 'side' },
          item.installedVersion && h('span', { className: 'suite-badge ver' }, item.installedVersion),
          h('span', { className: 'suite-badge ' + badge.cls }, badge.text)),
      )
    }

    const STEP_LEVEL = {
      'step-start': { cls: 'lv-start', log: 'start', glyph: '▸' },
      'step-ok': { cls: 'lv-ok', log: 'ok', glyph: '✓' },
      'step-warn': { cls: 'lv-warn', log: 'warn', glyph: '!' },
      'step-fail': { cls: 'lv-fail', log: 'fail', glyph: '×' },
      'job-done': { cls: 'lv-done', log: 'ok', glyph: '✓' },
    }

    function stepText(e, t) {
      if (e.type === 'job-done') return fmt(t('progress.done'), { ok: e.ok ?? 0, failed: e.failed ?? 0 })
      const who = e.name ? `${e.name}${e.version ? '@' + e.version : ''}` : e.id
      return [who, e.message].filter(Boolean).join(' — ')
    }

    function ProgressPanel({ events, job, t, open, onToggle }) {
      const logRef = useRef(null)
      useEffect(() => { if (open && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [events, open])
      const lines = events.slice(-120)
      const last = useMemo(() => [...events].reverse().find(e => STEP_LEVEL[e.type]), [events])
      const failedAny = events.some(e => e.type === 'step-fail')
      return h('div', { className: 'suite-progress' },
        h('div', { className: 'line' },
          job ? h('span', { className: 'suite-spin' }) : h('span', { className: 'suite-idledot' }),
          h('b', null, job
            ? `${t('progress.title')} · ${t('job.' + (job.type ?? 'install'))}${job.pack ? ' · ' + job.pack : ''}`
            : t('progress.idle')),
          h('span', { className: 'job-meta' },
            job ? `${job.done}/${job.total} · ${job.pct ?? 0}%` : '',
            h('button', { type: 'button', className: 'suite-btn', onClick: onToggle }, open ? t('logHide') : t('logShow')))),
        job && h('div', { className: 'bar' },
          h('i', { className: !failedAny && job.pct === 100 ? 'done-ok' : '', style: { transform: `scaleX(${(job.pct ?? 0) / 100})` } })),
        job?.snapshot && h('div', { className: 'snapshot' }, fmt(t('snapshot'), { name: job.snapshot })),
        last && h('div', { className: 'latest ' + STEP_LEVEL[last.type].cls },
          h('span', { className: 'dot' }),
          h('span', { className: 'txt' }, stepText(last, t))),
        open && h('div', { className: 'log', ref: logRef },
          lines.length === 0 ? h('span', { className: 'dim' }, t('log.empty')) : lines.map((e, i) => {
            const lv = STEP_LEVEL[e.type] ?? { log: 'dim', glyph: '·' }
            const time = new Date(e.ts).toLocaleTimeString()
            const body = [e.id && `${e.id}${e.version ? '@' + e.version : ''}`, e.message, e.pack && `pack=${e.pack}`, e.snapshot && fmt(t('snapshot'), { name: e.snapshot })].filter(Boolean).join(' ')
            return h('div', { key: i, className: lv.log }, `[${time}] ${lv.glyph} ${e.type} ${body}`)
          })),
      )
    }

    function SuiteTab() {
      const [state, setState] = useState({ phase: 'loading', data: null, error: null })
      const [packId, setPackId] = useState('eac')
      const [checked, setChecked] = useState(() => new Set())
      const [events, setEvents] = useState([])
      const [job, setJob] = useState(null)
      const [confirmArm, setConfirmArm] = useState(false)
      const [notice, setNotice] = useState(null) // { kind: 'warn' | 'err', text }
      const [logOpen, setLogOpen] = useState(false)

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
              setJob({ type: e.jobType, pack: e.pack, total: e.total, done: 0, pct: 0, snapshot: e.snapshot })
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
      const tr = SuiteTab._t ?? ((x, vars) => (vars === undefined ? (DICT.zh[x] ?? x) : fmt(DICT.zh[x] ?? x, vars)))

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
        if (!selected.length) return setNotice({ kind: 'warn', text: tr('noSelection') })
        setNotice(null)
        try {
          await api('/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pack: packId, ids: selected.map(i => i.id) }) })
        } catch (err) { setNotice({ kind: 'err', text: String(err.message ?? err) }) }
      }
      const runInstallAll = async () => {
        if (!current?.items.length) return
        setNotice(null)
        try {
          await api('/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pack: packId }) })
        } catch (err) { setNotice({ kind: 'err', text: String(err.message ?? err) }) }
      }
      const runUpdate = async () => {
        setNotice(null)
        try { await api('/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: updatable.map(i => i.id) }) }) }
        catch (err) { setNotice({ kind: 'err', text: String(err.message ?? err) }) }
      }
      const runUninstall = async () => {
        if (!selected.length) return setNotice({ kind: 'warn', text: tr('noSelection') })
        if (!confirmArm) { setConfirmArm(true); setTimeout(() => setConfirmArm(false), 3000); return }
        setConfirmArm(false)
        setNotice(null)
        try {
          await api('/uninstall', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selected.map(i => i.id) }) })
        } catch (err) { setNotice({ kind: 'err', text: String(err.message ?? err) }) }
      }

      return h('div', { className: 'suite-root' },
        h('style', null, CSS),
        state.phase === 'loading' && h(Skel),
        state.phase === 'error' && h('div', { className: 'suite-errbox' },
          h(Icon.error),
          h('div', { className: 'err-title' }, tr('loadFailed')),
          h('div', { className: 'err-detail' }, state.error),
          h('div', { className: 'err-hint' }, tr('error.hint')),
          h('div', null, h('button', { type: 'button', className: 'suite-btn primary', onClick: load }, tr('retry')))),
        state.phase === 'ready' && h(Fragment, null,
          h('div', { className: 'suite-head' },
            h('span', { className: 'suite-title' }, tr('meta.title')),
            data?.suiteVersion && h('span', { className: 'suite-version' }, `v${data.suiteVersion}`),
            h('span', { className: 'suite-sub' }, tr('subtitle')),
            h('button', { type: 'button', className: 'suite-btn', onClick: load, disabled: busy }, tr('refresh'))),
          h(ProgressPanel, { events, job, t: tr, open: logOpen, onToggle: () => setLogOpen(o => !o) }),
          h('div', { className: 'suite-cards' },
            packs.map((p, i) => h(PackCard, {
              key: p.id, pack: p, active: p.id === packId, t: tr, delay: i * 70,
              onClick: () => { setPackId(p.id); setChecked(new Set()) },
            }))),
          current && h(Fragment, null,
            h('div', { className: 'suite-toolbar' },
              h('span', { className: 'suite-count' },
                `${fmt(tr('installed'), { n: current.items.filter(i => i.installed).length, m: current.items.length })} · ${fmt(tr('defaultDisabled'), { n: current.items.filter(i => i.defaultEnabled === false).length })}`),
              h('button', { type: 'button', className: 'suite-btn', onClick: () => setChecked(new Set(current.items.map(i => i.id))) }, tr('selectAll')),
              h('button', { type: 'button', className: 'suite-btn', onClick: () => setChecked(new Set(current.items.filter(i => !checked.has(i.id)).map(i => i.id))) }, tr('invert')),
              h('button', { type: 'button', className: 'suite-btn primary', onClick: runInstallAll, disabled: busy }, tr('installAll')),
              selected.length > 0 && h('button', { type: 'button', className: 'suite-btn primary', onClick: runInstall, disabled: busy }, fmt(tr('installSelected'), { n: selected.length })),
              updatable.length > 0 && h('button', { type: 'button', className: 'suite-btn', onClick: runUpdate, disabled: busy }, fmt(tr('updateAll'), { n: updatable.length })),
              h('button', {
                type: 'button',
                className: 'suite-btn danger' + (confirmArm ? ' armed' : ''),
                onClick: runUninstall, disabled: busy,
              }, confirmArm ? tr('clickAgainConfirm') : tr('uninstallSelected'))),
            notice && h('div', { className: 'suite-notice ' + notice.kind }, notice.text),
            current.items.length === 0
              ? h('div', { className: 'suite-empty' },
                  h(Icon.empty),
                  h('div', { className: 'empty-title' }, tr('empty.title')),
                  h('div', { className: 'empty-hint' }, tr('empty.hint')))
              : h('div', { className: 'suite-list' },
                  current.items.map((item, i) => h(Row, { key: item.id, item, index: i, checked: checked.has(item.id), onCheck: toggle, t: tr }))),
            current.items.length > 0 && h('div', { className: 'suite-note' }, tr('needRestart')),
          ),
        ),
      )
    }

    // ── apply ─────────────────────────────────────────────────────────────────
    function apply(ctx) {
      const t = ctx.locale?.bind?.(NS) ?? (x => x)
      // Convention: with no vars, return the raw template so call sites can
      // apply their own `fmt(tr(key), vars)`; with vars, translate first (some
      // shells interpolate themselves) and fmt afterwards (raw-template shells).
      SuiteTab._t = (x, vars) => (vars === undefined ? t(x) : fmt(t(x, vars), vars))
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
