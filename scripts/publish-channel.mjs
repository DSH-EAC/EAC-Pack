#!/usr/bin/env node
/**
 * publish-channel.mjs — 在线渠道构建与发布（幂等，可重跑）。
 *
 * 职责（v0.2.0 资产线 T6）：
 *   1. 汇总 dist/index.json 全部条目 → channel/channel.json（docs/API-v2.md §1 schema）。
 *      - channelVersion：读现有 channel/channel.json 递增 +1（初始 1）。
 *      - suite：version 0.2.0、file dsh-plugin-suite-0.2.0.tgz；本体 tgz 尚未打出时
 *        sha256/bytes 留占位（64 个 0 / 0），主线集成打出后重跑本脚本补齐。
 *   2. 生成 channel/SHA256SUMS（与 dist/SHA256SUMS 同内容，供 git raw 渠道侧校验）。
 *   3. 发布 GitHub Release `channel`：只上传 dist 的 tgz 与 SHA256SUMS，
 *      不上传 suite 本体 tgz（本体走 v0.2.0 版本 Release）。已存在则 --clobber 覆盖。
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
const SUITE_VERSION = '0.2.0';
const SUITE_FILE = `dsh-plugin-suite-${SUITE_VERSION}.tgz`;

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

// ---- suite 本体信息（未打出则占位） ----
const suiteCandidates = [path.join(ROOT, 'suite', SUITE_FILE), path.join(DIST, SUITE_FILE)];
const suiteTgz = suiteCandidates.find((p) => fs.existsSync(p));
const suiteInfo = {
  version: SUITE_VERSION,
  file: SUITE_FILE,
  sha256: suiteTgz
    ? crypto.createHash('sha256').update(fs.readFileSync(suiteTgz)).digest('hex')
    : '0'.repeat(64),
  bytes: suiteTgz ? fs.statSync(suiteTgz).size : 0,
};
if (!suiteTgz) {
  log(`WARN suite 本体 ${SUITE_FILE} 尚未打出，sha256/bytes 留占位 —— 主线集成后重跑本脚本补齐`);
}

// ---- notes（v0.2.0） ----
const notesZh = [
  'v0.2.0「完全体」首版在线渠道：全量 74 个插件离线 tgz + 在线更新通道。',
  '新增 6 套社区皮肤（deep-whale-manager / maid-atelier / orca-link / liang / deep-whale-day-night / endfield），内置 9 套皮肤升级皮肤馆（预览图 + Prompt 创作包）。',
  '注意：client-ui 皮肤之间互斥，请勿叠装；已装 @linxin666/dsh-web-all 的环境请使用其皮肤中心适配版。',
].join('\n');
const notesEn = [
  'First online channel of v0.2.0 "Complete Edition": 74 offline plugin tarballs + online update pipeline.',
  'Adds 6 community skins (deep-whale-manager / maid-atelier / orca-link / liang / deep-whale-day-night / endfield) and the skin gallery for the 9 built-in skins (previews + prompt packs).',
  'Note: client-ui skins are mutually exclusive — do not stack them. On hosts with @linxin666/dsh-web-all installed, use its skin-center adapter build.',
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
    gh(['release', 'view', 'channel', '--repo', 'zouyuxuan122/EAC-Plugin-Integration-Pack']);
  } catch {
    exists = false;
  }
  if (exists) {
    // 分批 --clobber 上传（gh 单次参数过长风险）
    for (let i = 0; i < assets.length; i += 20) {
      gh(['release', 'upload', 'channel', '--clobber', '--repo', 'zouyuxuan122/EAC-Plugin-Integration-Pack', ...assets.slice(i, i + 20)]);
      log(`  uploaded ${Math.min(i + 20, assets.length)}/${assets.length}`);
    }
  } else {
    gh([
      'release', 'create', 'channel',
      '--title', 'online channel',
      '--notes', 'auto channel release',
      '--repo', 'zouyuxuan122/EAC-Plugin-Integration-Pack',
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
