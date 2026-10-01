#!/usr/bin/env node
/**
 * fetch-assets.mjs — 皮肤馆（gallery）资产获取与清单生成（幂等，可重跑）。
 *
 * 职责（v0.2.0 资产线 T4）：
 *   1. prompts：从 .cache/skin-prompts-src（DSH-EAC/dsh-skin-prompt-packages 浅克隆）
 *      读 skin-prompts/packages/<id>/{manifest.json,prompt.md} → suite/assets/prompts/<id>/。
 *   2. previews：为 catalog/skins.json（builtin）+ catalog/community.json（community）
 *      每套皮肤落到 suite/assets/previews/<id>/{light,dark}.png。多级兜底：
 *        builtin  → ① .cache/aio-src（= DSH-EAC/DSH-Desktop-EAC@aio-v1 本地克隆）
 *                   ② raw.githubusercontent.com 同分支
 *                   ③ 本机 AIO 离线包（AIO_OFFLINE 环境变量或默认 D:/DSHEAC AIO）
 *                   ④ 640x360 渐变占位 PNG
 *        community→ 已缓存上游 tgz（.cache/community-tgz、.cache/npm-tarballs）内
 *                   preview/screenshots png → raw.githubusercontent 固定 revision → 占位
 *   3. gallery.json：严格按 docs/API-v2.md §2 schema 生成 suite/assets/gallery.json。
 *
 * 占位 PNG：node:zlib 手写 PNG 编码（IHDR/IDAT/IEND + CRC32），零第三方依赖。
 * 幂等：目标文件已存在则跳过（--force 重取）；gallery.json 每次全量重写。
 *
 * 用法：node scripts/fetch-assets.mjs [--force]
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, '.cache');
const SUITE_ASSETS = path.join(ROOT, 'suite', 'assets');
const PROMPTS_OUT = path.join(SUITE_ASSETS, 'prompts');
const PREVIEWS_OUT = path.join(SUITE_ASSETS, 'previews');
const PROMPTS_SRC = path.join(CACHE, 'skin-prompts-src', 'skin-prompts', 'packages');

const force = process.argv.includes('--force');
const log = (...a) => console.log('[fetch-assets]', ...a);

const PROMPTS_REPO = 'https://github.com/DSH-EAC/dsh-skin-prompt-packages.git';
// 内置皮肤的 AIO 侧预览源（aio-v1 分支即本仓库 .cache/aio-src 的上游）
const AIO_RAW_BASE = 'https://raw.githubusercontent.com/DSH-EAC/DSH-Desktop-EAC/aio-v1/assets/skins';
const AIO_LOCAL = [
  path.join(CACHE, 'aio-src', 'assets', 'skins'),
  process.env.AIO_OFFLINE ? path.join(process.env.AIO_OFFLINE, 'assets', 'skins') : null,
  'D:/DSHEAC AIO/assets/skins',
].filter(Boolean);

// 社区皮肤预览源（按优先级排列；pngOnly=true 时 webp 视为缺失 → 占位）
const COMMUNITY_PREVIEWS = {
  'deep-whale-manager': [], // 上游仓库无 preview png → 占位
  'maid-atelier': [], // 上游仅 preview/*.webp → 占位
  'orca-link': [
    { kind: 'tgz', tgz: path.join(CACHE, 'npm-tarballs', '@smalltailqwq+dsh-client-ui-skin-orca-link-0.1.7.tgz'), light: 'package/preview/light.png', dark: 'package/preview/dark.png' },
  ],
  liang: [
    { kind: 'url', url: 'https://raw.githubusercontent.com/kingOfSoySauce/dsh-liang-skin/976fcbf9b4a91b79f14b90c16cbe0d3f553c2bd3/docs/preview.png', sameBoth: true },
  ],
  'deep-whale-day-night': [
    { kind: 'tgz', tgz: path.join(CACHE, 'community-tgz', 'deep-whale-day-night-theme-0.1.12.tgz'), light: 'package/screenshots/day.png', dark: 'package/screenshots/night.png' },
  ],
  endfield: [], // 仓库仅 webp 截图 → 占位
};

// gallery 元数据补充（无 prompt manifest 的 community 皮肤）
const GALLERY_EXTRA = {
  'deep-whale-manager': { author: 'Small-tailqwq', tags: ['whale', 'manager', 'community'] },
  'maid-atelier': { author: 'Small-tailqwq', tags: ['whale', 'maid', 'anime', 'community'] },
  'orca-link': { author: 'Small-tailqwq', tags: ['whale', 'orca', 'anime', 'community'] },
  liang: { author: 'kingOfSoySauce', tags: ['rheostat', 'intensity', 'community'] },
  'deep-whale-day-night': { author: 'GGBond2424648901', tags: ['whale', 'day-night', 'community'] },
  endfield: { author: 'ymh0000123', tags: ['endfield', 'industrial', 'community'] },
};

const MUTEX_MANAGER = {
  mutexZh: '本条目为皮肤切换管理器：client-ui 皮肤之间互斥，经管理器统一切换，请勿叠装多个皮肤。已装 @linxin666/dsh-web-all 的环境请使用其皮肤中心适配版，不能叠装 standalone 版。',
  mutexEn: 'This entry is the skin switch manager: client-ui skins are mutually exclusive and switched via the manager; do not stack multiple skins. On hosts with @linxin666/dsh-web-all installed, use its skin-center adapter build instead of this standalone package.',
};
const MUTEX_SKIN = {
  mutexZh: 'client-ui 皮肤之间互斥，不可叠装（deep-whale-manager 为统一切换管理器）。已装 @linxin666/dsh-web-all 的环境请使用其皮肤中心适配版，不能叠装 standalone 版。',
  mutexEn: 'client-ui skins are mutually exclusive and must not be stacked (deep-whale-manager is the unified switcher). On hosts with @linxin666/dsh-web-all installed, use its skin-center adapter build instead of this standalone package.',
};

// RC2 真机适配扫查结论（D10，官方桌面端 v0.2.0-rc.2 逐款启用实测，每款启用前断言单皮肤生效）。
// 皮肤普遍针对 AIO/EAC 分叉版 Web UI 制作，官方 RC2 DOM 漂移会让装饰层
// （气泡/花纹）选择器打偏——这是上游皮肤自身的适配问题，与安装机制无关。
const COMPAT_RC2 = {
  miku: {
    compatZh: '✅ 适配良好：整壳换肤完整（标题栏/壁纸/状态栏），无错位。',
    compatEn: '✅ Good: full-shell reskin (title bar / wallpaper / status bar) with no misplacement.',
  },
  'dragon-heir': {
    compatZh: '✅ 适配良好：长城巨龙壁纸 + 淡雅红色点缀，布局干净无错位。',
    compatEn: '✅ Good: Great-Wall dragon wallpaper with subtle red accents; clean layout, no misplacement.',
  },
  minecraft: {
    compatZh: '✅ 适配良好：像素主题完整（像素按钮/像素字体），文字清晰。',
    compatEn: '✅ Good: pixel theme applies fully (pixel buttons / pixel font); text stays crisp.',
  },
  xp: {
    compatZh: '✅ 适配良好：Luna 蓝标题栏 + 底部任务栏复刻完整，无错位。',
    compatEn: '✅ Good: Luna title bar and bottom task bar reproduced; no misplacement.',
  },
  trading: {
    compatZh: '✅ 适配良好：行情顶栏/底栏 + 侧栏文字清晰，无错位。',
    compatEn: '✅ Good: market ticker bars render; sidebar text crisp; no misplacement.',
  },
  'whale-song': {
    compatZh: '✅ 适配良好：浅蓝鲸歌主题，布局干净无错位。',
    compatEn: '✅ Good: light-blue whale theme; clean layout, no misplacement.',
  },
  'orca-link': {
    compatZh: '✅ 适配良好（社区）：黑白水墨虎鲸立绘 + 标语文案，会话树缩进线清晰，无错位。',
    compatEn: '✅ Good (community): ink-wash orca artwork and slogan; clean session tree; no misplacement.',
  },
  qq98: {
    compatZh: '⚠️ 轻度问题：QQ2008 复古风格完整，但蓝色侧栏上的次要文字（会话时间戳、「展开其余」项）对比度偏低、不易读。',
    compatEn: '⚠️ Minor: the QQ2008 retro style applies, but secondary text on the blue sidebar (session timestamps, "show more") has low contrast.',
  },
  liang: {
    compatZh: '⚠️ 轻度问题：滑动变阻器特色滑块正常，但「新会话」按钮灰底灰字对比度偏低；其余布局正常。',
    compatEn: '⚠️ Minor: the signature slider works, but the "New Session" button is grey-on-grey (low contrast); otherwise fine.',
  },
  'blue-fantasy': {
    compatZh: '⚠️ 中度错位：主区域（输入框花框/分隔线）正常，但侧栏会话列表上会浮现装饰气泡、遮挡会话文字（上游装饰层选择器在 RC2 上打偏）。可正常使用，介意者等上游适配。',
    compatEn: '⚠️ Moderate: main area is fine, but decorative bubbles float over sidebar session text (upstream decoration selectors drift on RC2). Usable; wait for upstream fix if it bothers you.',
  },
  'deep-whale-day-night': {
    compatZh: '⚠️ 中度错位：昼/夜双主题与鲸鱼娘立绘正常，但侧栏会话文字被装饰气泡/立绘部分遮挡（与 blue-fantasy 同源装饰系统）。带「夜间」切换钮。',
    compatEn: '⚠️ Moderate: day/night themes and artwork render, but sidebar session text is partly covered by decorations (same decoration system as blue-fantasy). Includes the day/night toggle.',
  },
  endfield: {
    compatZh: '⚠️ 中度错位：整壳黑黄主题生效；但右下角状态指示器（status-rotator 插件）会错位到左上角并与菜单栏重叠——启用本皮肤时建议同时禁用 status-rotator 插件。',
    compatEn: '⚠️ Moderate: the black/yellow theme applies, but the bottom-right status pill (status-rotator plugin) jumps to the top-left and overlaps the menu bar — disable status-rotator while using this skin.',
  },
  ths: {
    compatZh: '❌ 明显问题：同花顺红金标题栏/行情条正常，但深色侧栏上的会话文字与工作区名称几乎不可见（文字颜色被主题覆盖）。当前版本不建议启用。',
    compatEn: '❌ Notable: the THS red title bar and tickers render, but sidebar session/workspace text is nearly invisible (text color overridden by the theme). Not recommended for now.',
  },
  'maid-atelier': {
    unsafe: true,
    compatZh: '💥 禁用启用按钮：真机实测启用本皮肤会导致官方 v0.2.0-rc.2 Web UI 渲染进程崩溃循环（主进程内存膨胀、CDP 失联），需从 profile 清单摘除才能恢复。等上游适配 RC2 后再启用。',
    compatEn: '💥 Enable disabled: enabling this skin crashed the official v0.2.0-rc.2 web UI in real-machine testing (renderer crash loop, main-process memory balloon). Wait for an upstream RC2-compatible build.',
  },
};
const COMPAT_DEFAULT = {
  compatZh: '未逐项目录化：本皮肤面向 AIO/EAC 分叉版 Web UI 制作，在官方 RC2 上可能存在不同程度的装饰层错位（选择器漂移），属上游适配问题，不影响安装与启用。',
  compatEn: 'Not itemized: this skin targets the AIO/EAC fork web UI and may show varying degrees of decoration misplacement on official RC2 (selector drift) — an upstream issue that does not affect install/enable.',
};

// ---------- PNG 占位编码（零依赖） ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function placeholderPng(id, w = 640, h = 360) {
  let seed = 0;
  for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const c1 = [seed & 0xff, (seed >> 8) & 0xff, (seed >> 16) & 0xff];
  const c2 = [255 - c1[0], 255 - c1[1], 255 - c1[2]];
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) {
      const t = (x / w) * 0.5 + (y / h) * 0.5;
      row[1 + x * 3] = Math.round(c1[0] + (c2[0] - c1[0]) * t);
      row[2 + x * 3] = Math.round(c1[1] + (c2[1] - c1[1]) * t);
      row[3 + x * 3] = Math.round(c1[2] + (c2[2] - c1[2]) * t);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 工具 ----------
async function download(url, dest) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 128 || buf[0] !== 0x89 || buf[1] !== 0x50) throw new Error('响应不是 PNG');
    fs.writeFileSync(dest, buf);
    return true;
  } catch (e) {
    // 本机 TLS 环境（schannel 吊销检查）可能让 node fetch 失败 → curl 兜底
    log(`fetch 失败（${e.message}），curl 兜底: ${url}`);
    execFileSync('curl', ['-fL', '--ssl-no-revoke', '--retry', '3', '-o', dest, url], { stdio: 'pipe' });
    if (!isPng(dest)) throw new Error('curl 下载结果不是 PNG');
    return true;
  }
}
function isPng(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(8);
    fs.readSync(fd, head, 0, 8, 0);
    fs.closeSync(fd);
    return head[0] === 0x89 && head[1] === 0x50;
  } catch {
    return false;
  }
}
// 从 tgz 内提取单文件到 stdout（相对路径调用 tar：GNU tar 会把 "D:" 当远程主机）
function tgzExtractFile(tgz, inner) {
  return execFileSync('tar', ['-xOzf', path.basename(tgz), inner], {
    cwd: path.dirname(tgz),
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  });
}
function isJpeg(buf) {
  return buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}
// JPEG → PNG：Windows 自带 .NET System.Drawing（非第三方依赖）；失败返回 null
function jpegToPng(buf) {
  const tmp = path.join(CACHE, 'fetch-assets-tmp');
  ensureDir(tmp);
  const inFile = path.join(tmp, `in-${crypto.randomBytes(4).toString('hex')}.jpg`);
  const outFile = inFile.replace(/\.jpg$/, '.png');
  fs.writeFileSync(inFile, buf);
  const script =
    `Add-Type -AssemblyName System.Drawing;` +
    `$img=[System.Drawing.Image]::FromFile('${inFile.replace(/\\/g, '\\\\')}');` +
    `$bmp=New-Object System.Drawing.Bitmap $img.Width,$img.Height;` +
    `$g=[System.Drawing.Graphics]::FromImage($bmp);` +
    `$g.DrawImage($img,0,0,$img.Width,$img.Height);` +
    `$bmp.Save('${outFile.replace(/\\/g, '\\\\')}',[System.Drawing.Imaging.ImageFormat]::Png);` +
    `$g.Dispose();$bmp.Dispose();$img.Dispose();`;
  try {
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'pipe' });
    return fs.readFileSync(outFile);
  } catch {
    return null;
  } finally {
    fs.rmSync(inFile, { force: true });
    fs.rmSync(outFile, { force: true });
  }
}
// 规范化图像字节：PNG 原样；JPEG 转 PNG；其余视为不可用（返回 null）
function normalizePng(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50) return buf;
  if (isJpeg(buf)) return jpegToPng(buf);
  return null;
}
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// ---------- 1. prompts ----------
function ensurePromptsRepo() {
  if (fs.existsSync(path.join(CACHE, 'skin-prompts-src', 'skin-prompts', 'packages'))) return;
  log('git clone --depth 1', PROMPTS_REPO);
  execFileSync('git', ['clone', '--depth', '1', PROMPTS_REPO, path.join(CACHE, 'skin-prompts-src')], { stdio: 'pipe' });
}

function copyPrompts() {
  ensurePromptsRepo();
  ensureDir(PROMPTS_OUT);
  const copied = [];
  if (!fs.existsSync(PROMPTS_SRC)) {
    console.warn('[fetch-assets] WARN: prompt 源缺失，跳过 prompts 拷贝');
    return copied;
  }
  for (const id of fs.readdirSync(PROMPTS_SRC)) {
    const src = path.join(PROMPTS_SRC, id);
    const manifest = path.join(src, 'manifest.json');
    const prompt = path.join(src, 'prompt.md');
    if (!fs.existsSync(manifest) || !fs.existsSync(prompt)) continue;
    const out = path.join(PROMPTS_OUT, id);
    ensureDir(out);
    for (const f of [manifest, prompt]) {
      const dst = path.join(out, path.basename(f));
      if (!force && fs.existsSync(dst)) continue;
      fs.copyFileSync(f, dst);
    }
    copied.push(id);
  }
  log(`prompts: ${copied.length} 套 →`, path.relative(ROOT, PROMPTS_OUT));
  return copied;
}

// ---------- 2. previews ----------
function placePng(dest, buf, label) {
  if (!force && fs.existsSync(dest) && isPng(dest)) return 'exists';
  fs.writeFileSync(dest, buf);
  log(`preview ${label} ->`, path.relative(ROOT, dest));
  return 'written';
}

async function fetchBuiltinPreviews(ids) {
  const result = {};
  for (const id of ids) {
    const outDir = path.join(PREVIEWS_OUT, id);
    ensureDir(outDir);
    const themes = {};
    for (const theme of ['light', 'dark']) {
      const dest = path.join(outDir, `${theme}.png`);
      if (!force && fs.existsSync(dest) && isPng(dest)) {
        themes[theme] = 'cache';
        continue;
      }
      // ① 本地 aio-src 克隆 ② raw.githubusercontent ③ 本机 AIO 离线包 ④ 占位
      const local = AIO_LOCAL.map((base) => path.join(base, id, 'preview', `${theme}.png`)).find(isPng);
      try {
        if (local) {
          fs.copyFileSync(local, dest);
          themes[theme] = 'aio-local-cache';
        } else {
          await download(`${AIO_RAW_BASE}/${id}/preview/${theme}.png`, dest);
          themes[theme] = 'aio-raw';
        }
      } catch (e) {
        fs.writeFileSync(dest, placeholderPng(id));
        themes[theme] = `placeholder(${e.message})`;
      }
    }
    result[id] = themes;
  }
  return result;
}

async function fetchCommunityPreviews(ids) {
  const result = {};
  for (const id of ids) {
    const outDir = path.join(PREVIEWS_OUT, id);
    ensureDir(outDir);
    const sources = COMMUNITY_PREVIEWS[id] || [];
    const themes = {};
    let resolved = false;
    for (const src of sources) {
      try {
        if (src.kind === 'tgz') {
          if (!fs.existsSync(src.tgz)) throw new Error('tgz 缓存不存在');
          const light = normalizePng(tgzExtractFile(src.tgz, src.light));
          if (!light) throw new Error(`${src.light} 无法规范化为 PNG`);
          fs.writeFileSync(path.join(outDir, 'light.png'), light);
          const dark = src.dark && src.dark !== src.light ? tgzExtractFile(src.tgz, src.dark) : light;
          const darkPng = normalizePng(dark);
          if (!darkPng) throw new Error(`${src.dark} 无法规范化为 PNG`);
          fs.writeFileSync(path.join(outDir, 'dark.png'), darkPng);
          themes.light = 'upstream-tgz';
          themes.dark = src.dark && src.dark !== src.light ? 'upstream-tgz' : 'light-copy';
          resolved = true;
        } else if (src.kind === 'url') {
          await download(src.url, path.join(outDir, 'light.png'));
          if (src.sameBoth) fs.copyFileSync(path.join(outDir, 'light.png'), path.join(outDir, 'dark.png'));
          else await download(src.url.replace('light', 'dark'), path.join(outDir, 'dark.png'));
          themes.light = 'upstream-raw';
          themes.dark = src.sameBoth ? 'light-copy' : 'upstream-raw';
          resolved = true;
        }
        break;
      } catch (e) {
        log(`WARN ${id}: 预览源失败（${e.message}），尝试下一级`);
      }
    }
    if (!resolved) {
      for (const theme of ['light', 'dark']) {
        const dest = path.join(outDir, `${theme}.png`);
        if (!force && fs.existsSync(dest) && isPng(dest)) {
          themes[theme] = 'cache';
          continue;
        }
        fs.writeFileSync(dest, placeholderPng(id));
        themes[theme] = 'placeholder';
      }
    }
    result[id] = themes;
  }
  return result;
}

// ---------- 3. gallery.json ----------
function buildGallery(previewMap) {
  const load = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', f), 'utf8'));
  const skins = [];
  for (const [file, origin] of [['skins.json', 'builtin'], ['community.json', 'community']]) {
    for (const entry of load(file)) {
      const id = entry.id;
      const manifestPath = path.join(PROMPTS_OUT, id, 'manifest.json');
      const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
      const extra = GALLERY_EXTRA[id] || {};
      const stripZh = (s) => String(s || '').replace(/^皮肤：/, '');
      const stripEn = (s) => String(s || '').replace(/^Skin: /, '');
      const previews = {};
      for (const theme of ['light', 'dark']) {
        const p = path.join(PREVIEWS_OUT, id, `${theme}.png`);
        previews[theme] = fs.existsSync(p) && isPng(p) ? `previews/${id}/${theme}.png` : null;
      }
      const promptFile = path.join(PROMPTS_OUT, id, 'prompt.md');
      const mutex = origin === 'community' ? (id === 'deep-whale-manager' ? MUTEX_MANAGER : MUTEX_SKIN) : {};
      if (id === 'maid-atelier' && origin === 'community') {
        mutex.mutexZh = '同皮肤新旧两版互斥（旧 @dsh-external 0.0.1 已退役）：不可与旧版叠装。' + MUTEX_SKIN.mutexZh;
        mutex.mutexEn =
          'Old and new builds of this skin are mutually exclusive (legacy @dsh-external 0.0.1 is retired); do not stack them. ' +
          MUTEX_SKIN.mutexEn;
      }
      skins.push({
        id,
        name: manifest?.name || stripZh(entry.titleZh),
        nameEn: manifest?.nameEn || stripEn(entry.titleEn),
        author: manifest?.author || extra.author || '',
        tags: manifest?.tags || extra.tags || ['skin'],
        license: entry.license,
        origin,
        pkgName: entry.name,
        pkgVersion: entry.version,
        previews,
        prompt: fs.existsSync(promptFile) ? `prompts/${id}/prompt.md` : null,
        mutexZh: mutex.mutexZh ?? null,
        mutexEn: mutex.mutexEn ?? null,
        notesZh: entry.descZh || '',
        notesEn: entry.descEn || '',
        compatZh: (COMPAT_RC2[id] ?? COMPAT_DEFAULT).compatZh,
        compatEn: (COMPAT_RC2[id] ?? COMPAT_DEFAULT).compatEn,
        unsafe: Boolean(COMPAT_RC2[id]?.unsafe),
      });
    }
  }
  return { generatedAt: new Date().toISOString(), skins };
}

// ---------- 主流程 ----------
const builtinIds = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'skins.json'), 'utf8')).map((e) => e.id);
const communityIds = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'community.json'), 'utf8')).map((e) => e.id);

copyPrompts();
const builtinPrev = await fetchBuiltinPreviews(builtinIds);
const communityPrev = await fetchCommunityPreviews(communityIds);

const gallery = buildGallery({ builtinPrev, communityPrev });
const galleryPath = path.join(SUITE_ASSETS, 'gallery.json');
fs.writeFileSync(galleryPath, JSON.stringify(gallery, null, 2) + '\n');

log('previews(builtin):', JSON.stringify(builtinPrev));
log('previews(community):', JSON.stringify(communityPrev));
log(`gallery.json: ${gallery.skins.length} 套皮肤（builtin ${gallery.skins.filter((s) => s.origin === 'builtin').length} + community ${gallery.skins.filter((s) => s.origin === 'community').length}）`);
