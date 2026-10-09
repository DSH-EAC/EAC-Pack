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
const suiteCandidates = [path.join(ROOT, '.cache', 'cascade', 'artifacts', 'release', SUITE_FILE)];
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

// ---- notes (current suite contract) ----
const notesZh = [
  `v${SUITE_VERSION}：修复设置分组、余额设置与壁纸更新提示，使用已校验的完整资源基线。`,
  '设置分组只折叠实际设置行，不再隐藏整个设置页面；移除已退役的余额价格设置入口，保留输入区余额显示。',
  '提高壁纸更新提示按钮的对比度；移除已退役的 plugin-wizard；our-free-model 默认开启。',
  '完整 Release 内置固定版本资源依赖；Git 安装仍须该资源版本已在生产 registry 发布并通过验证。',
  '第三方资源保留原许可、署名和非商业等限制；资源齐全不代表所有子插件或其传递依赖离线可用。',
].join('\n');
const notesEn = [
  `v${SUITE_VERSION}: fixes settings grouping, balance settings and wallpaper update notices with a verified resource baseline.`,
  'Settings grouping collapses actual rows instead of the entire page; removes the retired balance pricing settings while preserving the composer balance display.',
  'Improves wallpaper update button contrast; removes the retired plugin-wizard; our-free-model is enabled by default.',
  'The full Release bundles the pinned resource dependency. Git installation still requires that resource version to be published and verified in the production registry.',
  'Third-party licenses, attribution and non-commercial restrictions remain applicable. Complete resources do not imply that every plugin or transitive dependency works offline.',
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
  const assets = index.map(({ file }) => {
    if (path.basename(file) !== file || !file.endsWith('.tgz') || file === SUITE_FILE || file.startsWith('eac-plugin-suite-')) {
      throw new Error(`Invalid plugin channel asset: ${file}`);
    }
    return path.join(DIST, file);
  });
  assets.push(path.join(DIST, 'SHA256SUMS'));
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
  // Commit ONLY the two channel files. A bare `git commit` would also sweep in any
  // unrelated staged work, and a --no-upload run still bumps channelVersion, so this
  // must never publish a channel that was not explicitly intended.
  const paths = [rel(CHANNEL_FILE), rel(path.join(CHANNEL, 'SHA256SUMS'))];
  execFileSync('git', ['add', '--', ...paths], { cwd: ROOT, stdio: 'pipe' });
  const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--', ...paths], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (staged) {
    execFileSync(
      'git',
      ['commit', '-m', `chore(channel): publish online channel v${channelVersion} (suite ${SUITE_VERSION}, ${channel.items.length} items)`, '--', ...paths],
      { cwd: ROOT, stdio: 'pipe' },
    );
    log(`git commit: ${staged.split('\n').join(', ')}`);
  } else {
    log('channel/ 无变更，跳过提交');
  }
}
log('完成');
