/**
 * dev-only mock of the host half's `/api/eac-plugin-suite/*` backend.
 *
 * Mirrors index.js shapes: /status projection, an event ring, and a serial job
 * engine that walks entries step by step. The simulation deliberately includes
 * one failing entry (computer-user), one version-exemption entry
 * (openclaw-bridge: warn → ok) and one build-script-warning entry
 * (agent-teams: warn → ok) whenever the job touches them.
 *
 * v0.2.0 additions (docs/API-v2.md): channel simulation (status / check /
 * config / apply), the skin gallery (16 skins with light/dark previews,
 * mutex notes and full prompt texts), prompt endpoints and SVG placeholder
 * preview assets. The boot shim routes requests here.
 */
import { ENTRIES, INITIAL_STATE } from './mock-entries.mjs'

export const SUITE_VERSION = '0.1.7'
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

// ---------------------------------------------------------------------------
// skin gallery — 16 entries per docs/API-v2.md §2 (10 builtin + 6 community).
// Two entries deliberately have no previews (placeholder test) and one has
// no prompt (empty-prompt test). ids either match mock catalog entries (so
// install/enable round-trip) or get synthetic catalog entries below.
// ---------------------------------------------------------------------------
export const GALLERY = {
  generatedAt: '2026-10-01T12:00:00.000Z',
  skins: [
    gallerySkin('skin-aurora', 'Aurora 极光', 'Aurora', '涂山苏苏', 'builtin', '@community/dsh-skin-aurora', '1.0.0', {
      notesZh: '冷色渐变光晕与毛玻璃层叠，暗色场景下层次分明。',
      notesEn: 'Cold gradient halos with layered glass, crisp in dark scenes.',
    }),
    gallerySkin('skin-sakura', 'Sakura 樱粉', 'Sakura', '花丸', 'builtin', '@community/dsh-skin-sakura', '1.1.0', {
      notesZh: '低饱和樱花粉配色，圆角与柔和阴影。',
      notesEn: 'Low-saturation sakura palette with soft corners and shadows.',
    }),
    gallerySkin('skin-nord', 'Nord 极地', 'Nord', '北极坐观者', 'builtin', '@community/dsh-skin-nord', '1.2.0', {
      notesZh: 'Nordic 冷蓝灰调色板，适合长时间阅读。',
      notesEn: 'Nordic blue-grey palette, easy on the eyes for long sessions.',
    }),
    gallerySkin('skin-gruvbox', 'Gruvbox 折衷', 'Gruvbox', 'Terminal 党', 'builtin', '@community/dsh-skin-gruvbox', '1.3.0', {
      notesZh: '复古暖棕与芥末黄，终端党熟悉的味道。',
      notesEn: 'Retro warm browns and mustard yellow — a terminal classic.',
    }),
    gallerySkin('skin-catppuccin', 'Catppuccin 奶咖', 'Catppuccin', 'Catppuccin Org', 'builtin', '@community/dsh-skin-catppuccin', '1.4.0', {
      notesZh: '低对比度柔和四档主题（Mocha/Frappe/Macchiato/Latte）。',
      notesEn: 'Soft low-contrast flavours: Mocha / Frappe / Macchiato / Latte.',
    }),
    gallerySkin('skin-solarized', 'Solarized 日晒', 'Solarized', 'Ethan Schoonover', 'builtin', '@community/dsh-skin-solarized', '1.5.0', {
      notesZh: '经典 Solarized 双主题，护眼黄绿底。',
      notesEn: 'The classic Solarized duo on an eye-friendly yellow-green base.',
      prompt: null,
    }),
    gallerySkin('skin-dracula', 'Dracula 暗夜', 'Dracula', 'Dracula Theme', 'builtin', '@community/dsh-skin-dracula', '1.6.0', {
      notesZh: '高对比紫粉配色，深色背景下的霓虹感。',
      notesEn: 'High-contrast purple/pink neon on a deep dark background.',
    }),
    gallerySkin('skin-one-dark', 'One Dark', 'One Dark', 'Atom 社区', 'builtin', '@community/dsh-skin-one-dark', '1.7.0', {
      notesZh: 'Atom One Dark 移植，冷静的深灰蓝。',
      notesEn: 'Atom One Dark ported: calm deep grey-blues.',
    }),
    gallerySkin('skin-github-light', 'GitHub Light', 'GitHub Light', 'GitHub', 'builtin', '@community/dsh-skin-github-light', '1.8.0', {
      notesZh: 'GitHub 亮色风格，白底蓝链接近原生文档观感。',
      notesEn: 'GitHub light style — white canvas, blue links, docs-native feel.',
    }),
    gallerySkin('skin-win-aero', 'Windows Aero', 'Windows Aero', '怀旧电子鱼', 'builtin', '@community/dsh-skin-win-aero', '1.9.0', {
      notesZh: 'Win7 Aero 玻璃质感复刻，半透明高光边框。',
      notesEn: 'A Win7 Aero glass replica with translucent highlight borders.',
    }),
    gallerySkin('miku', '初音未来 · 电子歌姬', 'Hatsune Miku', '涂山苏苏', 'community', '@linxin666/dsh-client-ui-skin-miku', '0.1.11', {
      license: 'BSD-3-Clause',
      notesZh: '电子歌姬主题：葱色主调、舞台灯光高光与浮动音符装饰。',
      notesEn: 'Virtual diva theme: leek-teal accents, stage-light highlights, floating notes.',
      mutexZh: '与「Dragon Heir 龙裔」皮肤互斥：两者都会接管侧栏动效，请勿同时启用。',
      mutexEn: 'Mutually exclusive with Dragon Heir: both take over the sidebar motion, enable only one.',
    }),
    gallerySkin('blue-fantasy', '蓝色幻想 · 修仙', 'Blue Fantasy', 'linxin666', 'community', '@linxin666/dsh-client-ui-skin-blue-fantasy', '0.1.11', {
      license: 'BSD-3-Clause',
      notesZh: '水墨蓝幻想风：云海渐变背景与毛玻璃卡片。',
      notesEn: 'Ink-wash blue fantasy: cloud-sea gradients on frosted cards.',
      mutexZh: '与「女仆工坊」系列皮肤互斥。',
      mutexEn: 'Mutually exclusive with the Maid Atelier skin family.',
    }),
    gallerySkin('dragon-heir', 'Dragon Heir 龙裔', 'Dragon Heir', 'linxin666', 'community', '@linxin666/dsh-client-ui-skin-dragon-heir', '0.1.11', {
      license: 'BSD-3-Clause',
      previews: null,
      notesZh: '龙裔金纹暗金主题（本条目无预览图，用于占位渲染测试）。',
      notesEn: 'Golden dragon-heir theme (no previews — placeholder rendering test).',
      mutexZh: '与「初音未来」皮肤互斥。',
      mutexEn: 'Mutually exclusive with the Hatsune Miku skin.',
    }),
    gallerySkin('minecraft', 'Minecraft 像素方块', 'Minecraft', 'linxin666', 'community', '@linxin666/dsh-client-ui-skin-minecraft', '0.1.11', {
      license: 'BSD-3-Clause',
      notesZh: '像素方块主题：草方块绿 + 苦力怕绿高亮，等宽像素字体。',
      notesEn: 'Pixel-block theme: grass green + creeper accents, pixel mono font.',
    }),
    gallerySkin('qq98', 'QQ 经典 98', 'QQ Classic 98', 'linxin666', 'community', '@linxin666/dsh-client-ui-skin-qq98', '0.1.11', {
      license: 'BSD-3-Clause',
      previews: null,
      notesZh: '复刻 QQ98 经典蓝白窗体（本条目无预览图，用于占位渲染测试）。',
      notesEn: 'A QQ98 blue/white window chrome revival (no previews — placeholder test).',
    }),
    gallerySkin('ths', '东方 Project · 幻想乡', 'Touhou Gensokyo', 'linxin666', 'community', '@linxin666/dsh-client-ui-skin-ths', '0.1.11', {
      license: 'BSD-3-Clause',
      notesZh: '幻想乡红白主题：巫女符纸红与夜空蓝。',
      notesEn: 'Gensokyo red/white: shrine charm red against night-sky blue.',
    }),
  ],
}

function gallerySkin(id, name, nameEn, author, origin, pkgName, pkgVersion, extra = {}) {
  const hasPreview = extra.previews !== null
  return {
    id,
    name,
    nameEn,
    author,
    tags: ['dreamskin'],
    license: extra.license ?? 'MIT',
    origin,
    pkgName,
    pkgVersion,
    previews: hasPreview ? { light: `previews/${id}/light.png`, dark: `previews/${id}/dark.png` } : null,
    prompt: extra.prompt === null ? null : `prompts/${id}/prompt.md`,
    mutexZh: extra.mutexZh ?? null,
    mutexEn: extra.mutexEn ?? null,
    notesZh: extra.notesZh ?? null,
    notesEn: extra.notesEn ?? null,
  }
}

/** Prompt full texts (rendered in the drawer). */
const PROMPT_SAMPLES = {
  miku: `# Hatsune Miku · 电子歌姬

把 DeepSeek Harness 桌面端重新粉刷成「电子歌姬」演唱会现场。

## 色彩
- 主色 teal #39C5BB，辅助深墨 #0F2B2E，高光白 #F4FFFD
- 会话气泡：teal 8% 透明度底 + 1px teal 30% 描边
- 代码块背景 #0D1F22，行高亮 #39C5BB22

## 动效
- 侧栏 hover 时浮现 3 个上浮音符（opacity + translateY）
- 发送按钮按下时播放一圈 teal 波纹（scale 0.9 → 1.06 → 1）

## 字体
- 标题使用圆润黑体（HarmonyOS Sans / MiSans），正文保持系统默认

> 仅调整外观，不改动任何布局逻辑；适配 light/dark 双主题。`,
  default: `# {{name}}

为该皮肤生成的绘制 prompt（示例占位全文）。

## 色彩
- 主色与强调色遵循皮肤 manifest 的 palette 字段
- 背景 / 前景保持 DSH alias 变量映射，避免硬编码

## 布局
- 只调整圆角、阴影与描边，不改变组件层级
- 列表行高统一 44px，卡片内边距 12/14px

## 适配
- light / dark 双主题各出一版
- 遵循 prefers-reduced-motion：所有动画时长归 0.01ms`,
}

export function promptTextFor(skin) {
  if (!skin.prompt) return null
  return PROMPT_SAMPLES[skin.id] ?? PROMPT_SAMPLES.default.replace('{{name}}', skin.nameEn || skin.name)
}

export function manifestFor(skin) {
  return {
    name: skin.pkgName,
    version: skin.pkgVersion,
    description: `${skin.nameEn} — DeepSeek Harness client UI skin`,
    author: skin.author,
    license: skin.license,
    dsh: { kind: 'client-ui-skin', previews: Boolean(skin.previews) },
  }
}

/** Deterministic SVG placeholder standing in for real PNG previews. */
export function previewSvg(id, theme) {
  let hash = 0
  for (const ch of String(id)) hash = (hash * 31 + ch.codePointAt(0)) % 360
  const hue = hash
  const hue2 = (hash + 70) % 360
  const dark = theme === 'dark'
  const bg1 = `hsl(${hue} 55% ${dark ? 22 : 78}%)`
  const bg2 = `hsl(${hue2} 60% ${dark ? 16 : 66}%)`
  const fg = dark ? 'rgba(255,255,255,.85)' : 'rgba(20,24,32,.8)'
  const sub = dark ? 'rgba(255,255,255,.5)' : 'rgba(20,24,32,.45)'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg1}"/>
      <stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
  </defs>
  <rect width="640" height="400" fill="url(#g)"/>
  <rect x="40" y="52" width="230" height="296" rx="14" fill="${dark ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.55)'}"/>
  <rect x="60" y="80" width="150" height="14" rx="7" fill="${fg}" opacity=".8"/>
  <rect x="60" y="110" width="190" height="10" rx="5" fill="${fg}" opacity=".45"/>
  <rect x="60" y="132" width="170" height="10" rx="5" fill="${fg}" opacity=".45"/>
  <rect x="60" y="170" width="190" height="64" rx="10" fill="${fg}" opacity=".16"/>
  <rect x="300" y="52" width="300" height="210" rx="14" fill="${dark ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.55)'}"/>
  <rect x="322" y="76" width="120" height="12" rx="6" fill="${fg}" opacity=".7"/>
  <rect x="322" y="104" width="256" height="9" rx="4.5" fill="${fg}" opacity=".4"/>
  <rect x="322" y="124" width="230" height="9" rx="4.5" fill="${fg}" opacity=".4"/>
  <rect x="322" y="160" width="180" height="76" rx="10" fill="${fg}" opacity=".16"/>
  <text x="320" y="318" font-family="Segoe UI, sans-serif" font-size="26" font-weight="700" fill="${fg}" text-anchor="middle">${id} · ${theme}</text>
  <text x="320" y="346" font-family="Segoe UI, sans-serif" font-size="13" fill="${sub}" text-anchor="middle">dev placeholder preview</text>
</svg>`
}

// ---------------------------------------------------------------------------
// store
// ---------------------------------------------------------------------------
export function createSuiteStore() {
  const state = {
    installed: new Set(INITIAL_STATE.installed),
    disabled: new Set(INITIAL_STATE.disabled),
    installedVersions: { ...INITIAL_STATE.installedVersions },
    events: [],
    listeners: new Set(),
    jobSeq: 0,
    currentJob: null,
    // gallery-only skins become synthetic catalog entries so /status can
    // project install state for them (install/enable round-trips in preview)
    extra: new Map(),
    // channel simulation knobs (mutated by the dev panel)
    channelOnline: true,
    channelHasUpdates: true,
    channelHold: false,
    config: {
      autoUpdate: true,
      autoUpdateHeavy: false,
      mirror: null,
      intervalHours: 6,
      lastCheckedAt: '2026-10-01T11:30:00.000Z',
    },
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

  /** Register gallery-only skins as catalog entries (visual tier, default-off). */
  for (const skin of GALLERY.skins) {
    if (!BY_ID.has(skin.id)) {
      const entry = {
        id: skin.id,
        name: skin.pkgName,
        version: skin.pkgVersion,
        tier: 'visual',
        defaultEnabled: false,
        titleZh: skin.name,
        titleEn: skin.nameEn,
        descZh: skin.notesZh ?? `${skin.nameEn} 社区皮肤（在「皮肤切换」中启用）。`,
        descEn: skin.notesEn ?? `${skin.nameEn} community skin (enable via Skin Switch).`,
        license: skin.license,
        source: skin.origin === 'community' ? 'community' : 'builtin',
        notes: skin.notesZh ?? '',
      }
      BY_ID.set(skin.id, entry)
      state.extra.set(skin.id, entry)
    }
  }

  const skinsAll = () => [...ENTRIES.skins, ...state.extra.values()]

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
      skins: skinsAll().map(projectEntry),
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
    let list
    if (pack === 'skins') list = skinsAll()
    else if (pack) list = ENTRIES[pack] ?? []
    else list = [...ENTRIES.eac, ...ENTRIES.aio, ...skinsAll()]
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

  // -------------------------------------------------------------------------
  // channel simulation (docs/API-v2.md §4)
  // -------------------------------------------------------------------------
  const UPDATES_FULL = [
    {
      id: 'terminal', name: '@deepseek-ai/dsh-terminal',
      installedVersion: '0.1.0', channelVersion: '0.2.0',
      tier: 'core', packs: ['eac'], installed: true,
      titleZh: '会话内终端', titleEn: 'In-session Terminal',
    },
    {
      id: 'skin-switch', name: '@deepseek-ai/dsh-skin-switch',
      installedVersion: '0.9.8', channelVersion: '1.0.0',
      tier: 'core', packs: ['eac', 'aio'], installed: true,
      titleZh: '皮肤切换', titleEn: 'Skin Switch',
    },
    {
      id: 'better-sidebar', name: '@dsh-external/dsh-better-sidebar',
      installedVersion: '1.2.0', channelVersion: '1.3.0',
      tier: 'heavy', packs: ['eac'], installed: true,
      titleZh: '更好侧栏', titleEn: 'Better Sidebar',
    },
    {
      id: 'message-rewind', name: '@deepseek-ai/dsh-message-rewind',
      installedVersion: '0.3.1', channelVersion: '0.4.0',
      tier: 'core', packs: ['eac'], installed: true,
      titleZh: '消息回溯', titleEn: 'Message Rewind',
    },
    {
      id: 'visualize', name: '@nagi-ovo/dsh-visualize',
      installedVersion: null, channelVersion: '0.1.4',
      tier: 'visual', packs: ['eac'], installed: false,
      titleZh: '图表可视化', titleEn: 'Visualize',
    },
    {
      id: 'side-session', name: '@dsh-external/dsh-side-session',
      installedVersion: null, channelVersion: '0.2.8',
      tier: 'visual', packs: ['eac'], installed: false,
      titleZh: '侧边小会话', titleEn: 'Side Session',
    },
  ]

  function channelStatus() {
    const online = state.channelOnline
    const updates = online && state.channelHasUpdates ? UPDATES_FULL : []
    const suiteUpdate = online && state.channelHasUpdates
      ? {
          version: '0.2.1',
          file: 'eac-plugin-suite-0.2.1.tgz',
          sha256: 'f'.repeat(64),
          bytes: 125909484,
          downloadUrl: 'https://github.com/DSH-EAC/EAC-Pack/releases/download/channel/eac-plugin-suite-0.2.1.tgz',
        }
      : null
    return {
      state: online ? 'online' : 'offline',
      ...state.config,
      nextCheckAt: online ? new Date(Date.now() + state.config.intervalHours * 3600e3).toISOString() : null,
      channelVersion: online ? 2 : null,
      channelGeneratedAt: online ? '2026-10-01T12:00:00.000Z' : null,
      notesZh: online
        ? '渠道 v2：\n· 会话内终端 0.2.0（SSE 流式重写）\n· 皮肤切换 1.0.0（新增 6 款社区皮肤图鉴）\n· 更好侧栏 1.3.0（heavy，建议手动更新）\n· 整合包 0.2.1 修复离线安装偶发丢 snapshot 的问题'
        : null,
      notesEn: online
        ? 'Channel v2:\n- In-session Terminal 0.2.0 (streaming rewrite)\n- Skin Switch 1.0.0 (6 new community skins)\n- Better Sidebar 1.3.0 (heavy, update manually)\n- Suite 0.2.1 fixes occasional snapshot loss on offline installs'
        : null,
      updates,
      suiteUpdate,
      error: online ? null : 'probe failed: all 3 sources unreachable (simulated)',
    }
  }

  async function checkChannel() {
    if (state.channelHold) await sleep(10 * 60 * 1000) // hold "checking" for screenshots
    else await sleep(800)
    state.config.lastCheckedAt = new Date().toISOString()
    const status = channelStatus()
    emit({ type: 'channel', state: status.state, channelVersion: status.channelVersion })
    return status
  }

  function saveConfig(patch = {}) {
    for (const key of ['autoUpdate', 'autoUpdateHeavy', 'mirror', 'intervalHours']) {
      if (patch[key] !== undefined) state.config[key] = patch[key]
    }
    return { ...channelStatus(), ...state.config }
  }

  /** /channel/apply — simulate download (download-progress) + install steps. */
  async function executeApplyJob(job) {
    const wanted = new Set(job.ids ?? [])
    const updates = UPDATES_FULL.filter((u) => wanted.has(u.id))
    state.currentJob = { id: job.id, type: 'apply', pack: null }
    emit({ type: 'job-start', jobId: job.id, jobType: 'apply', pack: null, total: updates.length, snapshot: null })
    let ok = 0
    let failed = 0
    for (const upd of updates) {
      emit({ type: 'step-start', jobId: job.id, id: upd.id, name: upd.name, version: upd.channelVersion })
      // download phase: one item reports an unknown total (-1)
      const total = upd.id === 'visualize' ? -1 : 1024 * 4096
      const steps = 5
      for (let i = 1; i <= steps; i++) {
        await sleep(Math.max(90, job.stepDelay / 2))
        const received = total === -1 ? -1 : Math.round((total * i) / steps)
        emit({
          type: 'download-progress', jobId: job.id, id: upd.id,
          received, total, percent: Math.round((i / steps) * 100),
        })
      }
      await sleep(job.stepDelay)
      const entry = BY_ID.get(upd.id)
      if (entry) markInstalled({ ...entry, version: upd.channelVersion })
      emit({ type: 'step-ok', jobId: job.id, id: upd.id, message: `downloaded + installed v${upd.channelVersion}` })
      ok++
    }
    emit({ type: 'job-done', jobId: job.id, jobType: 'apply', pack: null, ok, failed })
    state.currentJob = null
  }

  function enqueueApply({ ids, includeHeavy, stepDelay = 300 }) {
    const ids2 = includeHeavy ? ids : ids.filter((id) => UPDATES_FULL.find((u) => u.id === id && u.tier === 'heavy') == null)
    const job = { id: `job-${Date.now()}-${++state.jobSeq}`, type: 'apply', ids: ids2, stepDelay }
    executeApplyJob(job).catch(() => {})
    return job
  }

  return {
    status,
    emptyStatus,
    enqueueJob,
    enqueueApply,
    channelStatus,
    checkChannel,
    saveConfig,
    ring: () => [...state.events],
    subscribe: (fn) => {
      state.listeners.add(fn)
      return () => state.listeners.delete(fn)
    },
    // dev-panel knobs
    setChannelScenario({ online, hasUpdates, hold } = {}) {
      if (online !== undefined) state.channelOnline = online
      if (hasUpdates !== undefined) state.channelHasUpdates = hasUpdates
      if (hold !== undefined) state.channelHold = hold
    },
  }
}
