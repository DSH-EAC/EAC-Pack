#!/usr/bin/env node
/**
 * publish-channel.mjs — 在线渠道构建与发布（幂等，可重跑）。
 *
 * 职责（v0.2.0 资产线 T6）：
 *   1. 汇总 dist/index.json 全部条目 → channel/channel.json（docs/API-v2.md §1 schema）。
 *      - channelVersion：读现有 channel/channel.json 递增 +1（初始 1）。
 *      - suite：版本来自 suite/package.json，本体 tgz 必须存在；不允许占位摘要。
 *   2. 生成 channel/SHA256SUMS（与 dist/SHA256SUMS 同内容，供 git raw 渠道侧校验）。
 *   3. 发布 GitHub Release `channel`：只上传 dist 的 tgz 与 SHA256SUMS，
 *      不上传 suite 本体 tgz（本体走对应版本 Release）。已存在则 --clobber 覆盖。
 *   4. git add channel/ 并提交（不 push，由主线统一 push）。
 *
 * 用法：node scripts/publish-channel.mjs [--no-upload] [--no-commit]
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const CHANNEL = path.join(ROOT, 'channel');
const CHANNEL_FILE = path.join(CHANNEL, 'channel.json');
const SUITE_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'suite', 'package.json'), 'utf8')).version;
const SUITE_FILE = `eac-plugin-suite-${SUITE_VERSION}.tgz`;

const noUpload = process.argv.includes('--no-upload');
const noCommit = process.argv.includes('--no-commit');
const log = (...a) => console.log('[publish-channel]', ...a);
const gh = (args, opts = {}) =>
  execFileSync('gh', args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts });

const index = JSON.parse(fs.readFileSync(path.join(DIST, 'index.json'), 'utf8'));

// ---- channelVersion 递增 ----
let channelVersion = 1;
if (fs.existsSync(CHANNEL_FILE)) {
  try {
    const prev = JSON.parse(fs.readFileSync(CHANNEL_FILE, 'utf8'));
    if (Number.isInteger(prev.channelVersion)) channelVersion = prev.channelVersion + 1;
  } catch (e) {
    log(`WARN 现有 channel.json 不可解析（${e.message}），channelVersion 重置为 1`);
  }
}

// ---- suite 本体信息（不允许发布占位摘要） ----
const suiteCandidates = [path.join(ROOT, 'suite', SUITE_FILE), path.join(DIST, SUITE_FILE)];
const suiteTgz = suiteCandidates.find((p) => fs.existsSync(p));
if (!suiteTgz) throw new Error(`Missing full Release package ${SUITE_FILE}; pack it before publishing the channel`);
const suiteInfo = {
  name: 'eac-plugin-suite',
  downloadUrl: `https://github.com/DSH-EAC/EAC-Pack/releases/download/v${SUITE_VERSION}/${SUITE_FILE}`,
  version: SUITE_VERSION,
  file: SUITE_FILE,
  sha256: crypto.createHash('sha256').update(fs.readFileSync(suiteTgz)).digest('hex'),
  bytes: fs.statSync(suiteTgz).size,
};

// ---- notes（v0.2.0） ----
const notesZh = [
  'v0.2.1（issue #1 修复版）：修复官方内核上 2 处致命与 2 处一般缺陷。',
  '致命1：easy-setup / side-session / client-ui-custom（需 EAC 分叉版 settingsScope 服务）安装被跳过、启用被拒绝，UI 红徽章「仅 EAC 内核」锁定；即使被手工加回 bundles 也不再阻塞启动（重打包内含 disabled 硬钉）。',
  '致命2：内核自带包（dsh-plugin-manager / dsh-terminal 0.2.0-rc.2）不再被重打包副本遮蔽：安装跳过 + 启动自动清扫幽灵残留 + 已声明副本自动退役；重打包 plugin-manager 补 ./tools exports 兜底。受影响机器升级后首次启动即自愈。',
  '缺陷3：dsh-compact 1.0.1 修复补丁形态（insert 双行：主行 + agent 引擎行），请求路径自动压缩真正挂载。',
  '注意：dsh-compact 的 status/compact-now 端点与设置卡片依赖 EAC 分叉版服务，官方内核上不可用（无害）；skin-switch remote face 为上游已知问题。',
].join('\n');
const notesEn = [
  'v0.2.1 (issue #1 fixes): repairs 2 fatal and 2 moderate defects on the official kernel.',
  'Fatal 1: easy-setup / side-session / client-ui-custom (EAC-fork-only settingsScope) are skipped at install and refused at enable, with a locked "EAC fork only" badge; hand-adding them back to bundles can no longer block boot (hard-disabled rows in the repacks).',
  'Fatal 2: kernel-built-in packages (dsh-plugin-manager / dsh-terminal, 0.2.0-rc.2) are no longer shadowed: install skips, boot-time ghost sweep, offline retire of declared copies, and ./tools exports on the repack. Affected hosts self-heal on the first start after upgrading.',
  'Defect 3: dsh-compact 1.0.1 fixes the patch form (two insert rows: main + agent engine), so request-path compaction actually mounts.',
  'Note: dsh-compact status/compact-now endpoints and its settings card need EAC-fork services and stay unavailable (harmless) on the official kernel; skin-switch remote face mount remains a known upstream issue.',
].join('\n');

// ---- channel.json ----
const channel = {
  channelVersion,
  suiteVersion: SUITE_VERSION,
  generatedAt: new Date().toISOString(),
  notesZh,
  notesEn,
  items: index.map(({ id, name, version, packs, file, sha256, bytes, source }) => ({
    id,
    name,
    version,
    packs,
    file,
    sha256,
    bytes,
    source,
  })),
  suite: suiteInfo,
};
fs.mkdirSync(CHANNEL, { recursive: true });
fs.writeFileSync(CHANNEL_FILE, JSON.stringify(channel, null, 2) + '\n');
fs.copyFileSync(path.join(DIST, 'SHA256SUMS'), path.join(CHANNEL, 'SHA256SUMS'));
log(
  `channel.json v${channelVersion}: ${channel.items.length} items, suite ${SUITE_VERSION}` +
    (suiteTgz ? ' (sha256 实测)' : ' (sha256 占位)'),
);

if (noUpload) {
  log('--no-upload：跳过 Release 发布');
} else {
  const assets = fs
    .readdirSync(DIST)
    .filter((f) => f.endsWith('.tgz') || f === 'SHA256SUMS')
    .map((f) => path.join(DIST, f));
  if (!assets.some((p) => path.basename(p) === 'SHA256SUMS')) assets.push(path.join(DIST, 'SHA256SUMS'));
  const bytesTotal = assets.reduce((s, p) => s + fs.statSync(p).size, 0);
  log(`上传 ${assets.length} 个资产（${(bytesTotal / 1048576).toFixed(1)} MB）到 release "channel"…`);
  let exists = true;
  try {
    gh(['release', 'view', 'channel', '--repo', 'DSH-EAC/EAC-Pack']);
  } catch {
    exists = false;
  }
  if (exists) {
    // 分批 --clobber 上传（gh 单次参数过长风险）
    for (let i = 0; i < assets.length; i += 20) {
      gh(['release', 'upload', 'channel', '--clobber', '--repo', 'DSH-EAC/EAC-Pack', ...assets.slice(i, i + 20)]);
      log(`  uploaded ${Math.min(i + 20, assets.length)}/${assets.length}`);
    }
  } else {
    gh([
      'release', 'create', 'channel',
      '--title', 'online channel',
      '--notes', 'auto channel release',
      '--repo', 'DSH-EAC/EAC-Pack',
      ...assets,
    ]);
    log(`  created release with ${assets.length} assets`);
  }
}

if (noCommit) {
  log('--no-commit：跳过 git 提交');
} else {
  const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
  execFileSync('git', ['add', rel(CHANNEL_FILE), rel(path.join(CHANNEL, 'SHA256SUMS'))], { cwd: ROOT, stdio: 'pipe' });
  const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (staged) {
    execFileSync(
      'git',
      ['commit', '-m', `chore(channel): publish online channel v${channelVersion} (suite ${SUITE_VERSION}, ${channel.items.length} items)`],
      { cwd: ROOT, stdio: 'pipe' },
    );
    log(`git commit: ${staged.split('\n').join(', ')}`);
  } else {
    log('channel/ 无变更，跳过提交');
  }
}
log('完成');
