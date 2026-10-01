#!/usr/bin/env node
/**
 * DSH 插件整合包重打包管线（可复现）。
 *
 * 输入：catalog/{eac,aio,skins}.json + .cache 内的 EAC/aio 源（+ 本机 AIO 离线包兜底）。
 * 输出：dist/<name>_<version>.tgz（/ 已替换为 _）、dist/SHA256SUMS、dist/index.json。
 *
 * package.json 改写规则（rewritePeerDeps，见下）：
 *   1. peerDependencies["@deepseek-ai/dsh"]（若有）→ ">=0.1.0-rc.6"。
 *   2. 其余 @deepseek-ai/* peer：精确 pin（如 "0.1.3-alpha.2"）与 ^/~ 范围
 *      （如 "^4.0.1"）放宽为 ">=<floor>"；已是 ">=" 或 "*" 的保持不变。
 *      原因：AIO 第三方包大量精确 pin 0.1.3-alpha.2 内部件，在 dsh 0.2.0-rc.2
 *      下必然不满足；monotone 放宽（新范围 ⊇ 原范围）保证宿主版本 ≥ floor 即满足。
 *   3. 非 @deepseek-ai 作用域的 peer（react/react-dom/zod/cordis 等）不动。
 *   4. "files" 白名单存在时，强制补入源目录根下的许可证/署名文件
 *      （LICENSE、NOTICE、ASSET_LICENSE、THIRD_PARTY、COPYING、AUTHORS 等前缀族）
 *      与功能性清单（cordis.patch.yml / dsh-plugin.json / skin.json / PROVENANCE.json）
 *      —— npm pack 默认只保证 LICENSE 与 README，NOTICE 等不在白名单会被静默丢弃。
 *
 * 用法：node repack.mjs [--only <name-substring>]
 */
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const CATALOG_DIR = path.join(ROOT, 'catalog');
const DIST = path.join(ROOT, 'dist');
const CACHE = path.join(ROOT, '.cache');
const STAGING = path.join(CACHE, 'repack-staging');
const NPM_TGZ = path.join(CACHE, 'npm-tarballs');

const EAC_PLUGINS = path.join(CACHE, 'eac-src', 'dsh-desktop', 'assets', 'plugins');
const AIO_PLUGINS = path.join(CACHE, 'aio-src', 'assets', 'plugins');
const AIO_SKINS = path.join(CACHE, 'aio-src', 'assets', 'skins');
// 兜底提取源：本机 AIO 离线发行版的 web-desktop profile 种子 node_modules
const AIO_SEED_NM =
  process.env.AIO_SEED_NM || 'D:/DSHEAC AIO/resources/profile-seed/profiles/web-desktop/node_modules';

// npm 包基名 -> EAC v5.3.6 assets 目录名的例外（其余 = base name 本身）
const DIR_OVERRIDES = { 'meow-smooth': 'dsh-meow-smooth' };

// github 源（可复现：缓存目录缺 package.json 时自动浅克隆）。
// 兼容两种 source 取值：'github'（存量 EAC 独立分发）与 'github-repo'（v0.2.0 社区皮肤）。
const GH_SOURCES = {
  'dsh-think-zh-expand-eac': { url: 'https://github.com/jing-hy/dsh-think-zh-expand-eac.git', dir: 'think-zh-src' },
  '@nagi-ovo/dsh-visualize': { url: 'https://github.com/Nagi-ovo/dsh-visualize.git', dir: 'visualize-src' },
  'dsh-drag-and-drop': { url: 'https://github.com/bill9109/dsh-drag-and-drop.git', dir: 'dragdrop-src' },
  'dsh-theme-endfield': { url: 'https://github.com/ymh0000123/dsh-theme-endfield.git', dir: 'endfield-src' },
};

// github-tgz 源：社区作者经 GitHub Release 分发的 npm-pack 形态 tgz。
// 锁定具体 release 资产 URL（可复现，不追新）；下载缓存于 .cache/community-tgz/。
const GH_TGZ_SOURCES = {
  'dsh-client-liang-intensity-skin': {
    url: 'https://github.com/kingOfSoySauce/dsh-liang-skin/releases/download/v0.1.7/dsh-client-liang-intensity-skin-0.1.7.tgz',
  },
  // 键 = 实际包名（day-night 的包名 @dsh-external/dsh-client-ui-skin-deep-whale-day-night
  // ≠ 仓库名 deep-whale-day-night-theme，以 release tgz 内 package.json 为准）
  '@dsh-external/dsh-client-ui-skin-deep-whale-day-night': {
    url: 'https://github.com/GGBond2424648901/deep-whale-day-night-theme/releases/download/v0.1.12/deep-whale-day-night-theme-0.1.12.tgz',
  },
};

// aio seed 提取（本机 AIO 离线包 node_modules）的包集合
const AIO_SEED_PKGS = new Set([
  '@dsh-external/dsh-webui',
  '@ha-na-bi/dsh-client-ui-custom',
  '@local/dsh-webui-statem-bridge',
]);

const ALWAYS_KEEP = [
  'cordis.patch.yml',
  'dsh-plugin.json',
  'skin.json',
  'PROVENANCE.json',
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'LICENCE',
  'NOTICE',
  'NOTICE.md',
  'ASSET_LICENSE.md',
  'ASSET_LICENSE.txt',
  'THIRD_PARTY_NOTICES.md',
  'COPYING',
  'AUTHORS',
];

const onlyArg = (() => {
  const i = process.argv.indexOf('--only');
  return i >= 0 ? process.argv[i + 1] : null;
})();

const log = (...a) => console.log('[repack]', ...a);
const die = (msg) => {
  console.error('[repack] FATAL:', msg);
  process.exit(1);
};
const sh = (cmd, opts = {}) =>
  execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts });
// shell 引用：反斜杠翻倍是 cmd 传参毒药，统一换正斜杠（Windows API 与 tar 均接受）
const q = (p) => JSON.stringify(String(p).replace(/\\/g, '/'));

function loadCatalog(file) {
  return JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, file), 'utf8'));
}

// ---- 合并 catalog：以包名为唯一键，eac.json 为共享条目主记录 ----
const catalogs = {
  eac: loadCatalog('eac.json'),
  aio: loadCatalog('aio.json'),
  skins: loadCatalog('skins.json'),
  community: loadCatalog('community.json'),
};
const byName = new Map();
for (const [cat, list] of Object.entries(catalogs)) {
  for (const item of list) {
    if (item.source === 'unavailable') {
      log(`SKIP ${item.name} (source=unavailable)`);
      continue;
    }
    const prev = byName.get(item.name);
    if (prev) {
      if (prev.version !== item.version) die(`版本冲突 ${item.name}: ${prev.version} vs ${item.version}`);
      if (prev.source !== item.source) die(`来源冲突 ${item.name}: ${prev.source} vs ${item.source}`);
      prev.packs = Array.from(new Set([...prev.packs, ...item.packs]));
      prev._cats.push(cat);
    } else {
      byName.set(item.name, { ...item, _cats: [cat] });
    }
  }
}
let entries = Array.from(byName.values());
if (onlyArg) entries = entries.filter((e) => e.name.includes(onlyArg) || e.id.includes(onlyArg));
log(`catalog 条目合并完成：${byName.size} 唯一包，本轮处理 ${entries.length}`);

// ---- 工具 ----
// 手写递归复制：Windows 上 fs.cpSync 覆盖复制偶发 errno=0 的 unlink 怪癖
function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (name === '.git' || name === 'node_modules') continue;
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}

function rmRf(p) {
  if (!fs.existsSync(p)) return;
  try {
    fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* 落到下方兜底 */
  }
  if (!fs.existsSync(p)) return;
  // Windows 兜底：杀软/索引器握住句柄时 rmSync 会【静默失败】（实测报成功但目录仍在）。
  // 改名挪走 + cmd rd /s /q 实测可靠；rd 需要 cmd 风格反斜杠路径。
  const aside = `${p}.del-${Date.now()}`;
  try {
    fs.renameSync(p, aside);
  } catch (e) {
    throw new Error(`rmRf: 无法删除且无法改名 ${p}: ${e.message}`);
  }
  sh(`rd /s /q "${aside.replace(/\//g, '\\')}"`);
  if (fs.existsSync(p)) throw new Error(`rmRf: 删除失败 ${p}`);
}

function materializeNpm(entry, staging) {
  fs.mkdirSync(NPM_TGZ, { recursive: true });
  const isScoped = entry.name.startsWith('@');
  const tgzName = isScoped
    ? `${entry.name.split('/')[0]}+${entry.name.split('/')[1]}-${entry.version}.tgz`
    : `${entry.name}-${entry.version}.tgz`;
  let tgz = path.join(NPM_TGZ, tgzName);
  if (!fs.existsSync(tgz)) {
    log(`npm pack ${entry.name}@${entry.version}`);
    const out = JSON.parse(
      sh(`npm pack ${entry.name}@${entry.version} --pack-destination ${q(NPM_TGZ)} --json`),
    );
    tgz = path.join(NPM_TGZ, out[0].filename);
    const expected = path.join(NPM_TGZ, tgzName);
    if (path.resolve(tgz) !== path.resolve(expected)) fs.renameSync(tgz, expected); // 统一命名便于缓存复用
    tgz = expected;
  }
  if (!fs.existsSync(tgz)) die(`npm tarball 未就位: ${tgz}`);
  const tmp = path.join(STAGING, '.extract');
  rmRf(tmp);
  fs.mkdirSync(tmp, { recursive: true });
  // 注意：相对路径调用 tar —— GNU tar 会把 "D:\..." 的冒号解析为远程主机语法
  sh(`tar -xzf ${tgzName} -C ${q(tmp)}`, { cwd: NPM_TGZ });
  const pkgDir = path.join(tmp, 'package');
  if (!fs.existsSync(path.join(pkgDir, 'package.json'))) die(`tarball 内无 package/: ${tgz}`);
  copyTree(pkgDir, staging);
  rmRf(tmp);
}

function materializeEacTag(entry, staging) {
  let src;
  if (entry._cats.includes('skins') && fs.existsSync(path.join(AIO_SKINS, entry.id))) {
    src = path.join(AIO_SKINS, entry.id); // 皮肤（如 maid-atelier）
  } else if (AIO_SEED_PKGS.has(entry.name)) {
    src = path.join(AIO_SEED_NM, ...entry.name.split('/')); // AIO 离线包兜底
  } else {
    const base = entry.name.split('/').pop();
    const dir = DIR_OVERRIDES[base] || base;
    const eacDir = path.join(EAC_PLUGINS, dir);
    const aioDir = path.join(AIO_PLUGINS, dir);
    // 共享条目版本以 EAC 包为准：优先 v5.3.6，目录缺失再回退 aio-v1
    src = fs.existsSync(eacDir) ? eacDir : aioDir;
  }
  if (!fs.existsSync(path.join(src, 'package.json'))) die(`eac-tag 源目录缺 package.json: ${src}`);
  log(`copy ${path.relative(ROOT, src) || src} -> staging`);
  copyTree(src, staging);
}

function materializeGithub(entry, staging) {
  const gh = GH_SOURCES[entry.name];
  if (!gh) die(`catalog github 来源缺少 GH_SOURCES 映射: ${entry.name}`);
  const cloneDir = path.join(CACHE, gh.dir);
  if (!fs.existsSync(path.join(cloneDir, 'package.json'))) {
    log(`git clone --depth 1 ${gh.url}`);
    sh(`git clone --depth 1 ${gh.url} ${q(cloneDir)}`);
  }
  copyTree(cloneDir, staging);
}

// github-tgz：下载 release asset（npm-pack 形态 tgz）→ 解包 → 交由统一规范化。
// 兼容 package/ 前缀（npm pack 标准）与平铺两种布局。
const COMMUNITY_TGZ = path.join(CACHE, 'community-tgz');

function materializeGithubTgz(entry, staging) {
  const src = GH_TGZ_SOURCES[entry.name];
  if (!src) die(`catalog github-tgz 来源缺少 GH_TGZ_SOURCES 映射: ${entry.name}`);
  fs.mkdirSync(COMMUNITY_TGZ, { recursive: true });
  const tgz = path.join(COMMUNITY_TGZ, src.url.split('/').pop());
  if (!fs.existsSync(tgz) || fs.statSync(tgz).size < 1024) {
    log(`curl -fL ${src.url}`);
    // --ssl-no-revoke：Windows schannel 对部分代理/网络会报 CRYPT_E_NO_REVOCATION_CHECK
    sh(`curl -fL --ssl-no-revoke --retry 3 --silent --show-error -o ${q(tgz)} ${JSON.stringify(src.url)}`);
  }
  if (!fs.existsSync(tgz) || fs.statSync(tgz).size < 1024) die(`release tgz 下载失败: ${src.url}`);
  const tmp = path.join(STAGING, '.extract-gh-tgz');
  rmRf(tmp);
  fs.mkdirSync(tmp, { recursive: true });
  // 相对路径调用 tar（cwd=缓存目录）：GNU tar 会把 "D:\..." 的冒号解析为远程主机语法
  sh(`tar -xzf ${JSON.stringify(path.basename(tgz))} -C ${q(tmp)}`, { cwd: path.dirname(tgz) });
  const pkgDir = path.join(tmp, 'package');
  if (fs.existsSync(path.join(pkgDir, 'package.json'))) copyTree(pkgDir, staging);
  else if (fs.existsSync(path.join(tmp, 'package.json'))) copyTree(tmp, staging);
  else die(`release tgz 内无 package 目录: ${tgz}`);
  rmRf(tmp);
}

// 生命周期脚本：staging 目录只含发布物（files 白名单），源仓库的构建脚本
// （如 dsh-pet 的 scripts/prepack-check.js）多半不在内，npm pack 会执行
// prepack/prepare 导致失败。重打包语境下一律剥离生命周期脚本；
// preinstall/install/postinstall 同时避免 pnpm pendingBuilds 问题。
const LIFECYCLE_SCRIPTS = [
  'prepack',
  'prepare',
  'postpack',
  'prepublish',
  'prepublishOnly',
  'preinstall',
  'install',
  'postinstall',
];

function rewritePeerDeps(pkg) {
  const changes = [];
  const peers = pkg.peerDependencies;
  if (peers && typeof peers === 'object') {
    const out = { ...peers };
    for (const key of Object.keys(peers)) {
      const range = peers[key];
      if (key === '@deepseek-ai/dsh') {
        if (range !== '>=0.1.0-rc.6') {
          out[key] = '>=0.1.0-rc.6';
          changes.push(`${key}: ${JSON.stringify(range)} -> ">=0.1.0-rc.6"`);
        }
        continue;
      }
      if (!key.startsWith('@deepseek-ai/')) continue;
      const r = String(range).trim();
      if (r === '*' || r === 'x' || r.startsWith('>=')) continue;
      const m = /^[\^~=> ]*\s*v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)/.exec(r);
      if (m) {
        out[key] = `>=${m[1]}`;
        changes.push(`${key}: ${JSON.stringify(range)} -> ">=${m[1]}"`);
      } else {
        log(`WARN 未识别的 peer 范围，保持原样: ${key}: ${JSON.stringify(range)}`);
      }
    }
    pkg.peerDependencies = out;
  }
  return changes;
}

function ensureAttributionFiles(pkg, staging) {
  if (!Array.isArray(pkg.files)) return [];
  const added = [];
  for (const f of ALWAYS_KEEP) {
    if (pkg.files.includes(f)) continue;
    if (fs.existsSync(path.join(staging, f))) {
      pkg.files.push(f);
      added.push(f);
    }
  }
  return added;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// ---- 主流程 ----
fs.mkdirSync(DIST, { recursive: true });
fs.mkdirSync(STAGING, { recursive: true });
const index = [];

for (const entry of entries) {
  const file = `${entry.name.replace(/\//g, '_')}-${entry.version}.tgz`;
  const staging = path.join(STAGING, entry.name.replace(/[/@]/g, '_'));
  rmRf(staging);
  fs.mkdirSync(staging, { recursive: true });

  if (entry.source === 'npm') materializeNpm(entry, staging);
  else if (entry.source === 'eac-tag') materializeEacTag(entry, staging);
  else if (entry.source === 'github' || entry.source === 'github-repo') materializeGithub(entry, staging);
  else if (entry.source === 'github-tgz') materializeGithubTgz(entry, staging);
  else die(`未知 source: ${entry.source}`);

  const pkgFile = path.join(staging, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  if (pkg.name !== entry.name) die(`包名不符 catalog: ${pkg.name} != ${entry.name}`);
  if (pkg.version !== entry.version)
    die(`版本漂移 ${entry.name}: 源=${pkg.version} catalog=${entry.version}（请更新 catalog 或锁定源）`);

  const changes = rewritePeerDeps(pkg);
  let strippedScripts = [];
  if (pkg.scripts && typeof pkg.scripts === 'object') {
    for (const s of LIFECYCLE_SCRIPTS) {
      if (pkg.scripts[s]) {
        delete pkg.scripts[s];
        strippedScripts.push(s);
      }
    }
    if (!Object.keys(pkg.scripts).length) delete pkg.scripts;
  }
  const addedFiles = ensureAttributionFiles(pkg, staging);
  if (changes.length || addedFiles.length || strippedScripts.length) {
    fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
    for (const c of changes) log(`  peer: ${c}`);
    if (strippedScripts.length) log(`  scripts-= ${strippedScripts.join(', ')}`);
    if (addedFiles.length) log(`  files+= ${addedFiles.join(', ')}`);
  }

  const packOut = JSON.parse(
    sh(`npm pack --json --pack-destination ${q(DIST)}`, { cwd: staging }),
  );
  const produced = path.join(DIST, packOut[0].filename);
  const target = path.join(DIST, file);
  if (path.resolve(produced) !== path.resolve(target)) fs.renameSync(produced, target);

  const bytes = fs.statSync(target).size;
  index.push({
    id: entry.id,
    name: entry.name,
    version: entry.version,
    packs: entry.packs.slice().sort(),
    file,
    sha256: sha256(target),
    bytes,
    source: entry.source,
  });
  log(`OK ${file} (${bytes} bytes)`);
  rmRf(staging);
}

index.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(path.join(DIST, 'index.json'), JSON.stringify(index, null, 2) + '\n');
const sums = index.map((e) => `${e.sha256}  ${e.file}`).join('\n') + '\n';
fs.writeFileSync(path.join(DIST, 'SHA256SUMS'), sums);
// 清理孤儿：旧版本 tgz 与 suite 本体包不得留在 dist/（后者会经 sync 进入
// suite/assets/dist 再被 npm pack 吞下，形成自引用的指数膨胀）。
const wanted = new Set(index.map((e) => e.file));
let orphans = 0;
for (const name of fs.readdirSync(DIST)) {
  if (!name.endsWith('.tgz') || wanted.has(name)) continue;
  try {
    fs.rmSync(path.join(DIST, name), { force: true });
    orphans++;
  } catch { /* delete-pending：报告但不阻塞 */ }
}
if (orphans) log(`清理孤儿 tgz：${orphans} 个`);
log(`完成：dist/ 共 ${index.length} 个 tgz + index.json + SHA256SUMS`);
