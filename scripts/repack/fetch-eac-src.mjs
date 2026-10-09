#!/usr/bin/env node
/**
 * Materialize `.cache/eac-src` — the EAC plugin source tree that repack.mjs
 * reads for every `source: "eac-tag"` catalog entry.
 *
 * Why this exists
 * ---------------
 * repack.mjs:34 expects `.cache/eac-src/dsh-desktop/assets/plugins`, but nothing
 * in this repository ever created it, so the pipeline could only run on the one
 * machine that happened to have the cache. Worse, the EAC main repository
 * deliberately deleted `dsh-desktop/assets/plugins` at HEAD (ADR 0006 v4,
 * commit 6687b40 "剥离文件连同源码删除"), so those sources now exist only at the
 * pinned tag recorded in patches/source-patches.json.
 *
 * Implementation note
 * -------------------
 * Files are written by git itself (`read-tree --prefix` + `checkout-index`), not
 * by extracting a tar. Windows' bundled bsdtar cannot decode UTF-8 entry names
 * (many plugin assets have Chinese names) and would abort the extraction, while
 * git's own checkout writes them correctly and honours `core.autocrlf=false`,
 * keeping bytes identical to the blob the patches were generated against.
 *
 * Usage:
 *   node scripts/repack/fetch-eac-src.mjs [--force]
 *
 * Env:
 *   EAC_SRC_LOCAL  path to an existing clone that has the tag (skips network)
 *   EAC_SRC_REPO   override repository URL
 *   EAC_SRC_TAG    override tag
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const CACHE = path.join(ROOT, '.cache');
const DEST = path.join(CACHE, 'eac-src');

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches', 'source-patches.json'), 'utf8'));
const base = manifest.base?.eac;
if (!base?.tag || !base?.subdir) throw new Error('patches/source-patches.json: base.eac{tag,subdir} missing');

const repoUrl = process.env.EAC_SRC_REPO || base.repo;
const tag = process.env.EAC_SRC_TAG || base.tag;
const subdir = base.subdir; // e.g. dsh-desktop/assets/plugins

const run = (args, opts = {}) => execFileSync('git', args, { encoding: 'utf8', ...opts });

if (fs.existsSync(DEST) && !process.argv.includes('--force')) {
  console.log(`[eac-src] already present: ${path.relative(ROOT, DEST)} (use --force to refresh)`);
} else {
  // Resolve the repository that has the pinned tag.
  let repo = process.env.EAC_SRC_LOCAL;
  if (repo) {
    if (!fs.existsSync(repo)) throw new Error(`EAC_SRC_LOCAL not found: ${repo}`);
    console.log(`[eac-src] using local clone ${repo}`);
  } else {
    repo = path.join(CACHE, 'eac-src-repo');
    if (!fs.existsSync(path.join(repo, '.git'))) {
      console.log(`[eac-src] git clone --depth 1 --branch ${tag} ${repoUrl}`);
      run(['clone', '--depth', '1', '--branch', tag, repoUrl, repo], { stdio: 'inherit', encoding: undefined });
    }
  }
  run(['-C', repo, 'rev-parse', '--verify', `${tag}^{commit}`]);

  fs.rmSync(DEST, { recursive: true, force: true });
  const prefixRoot = path.join(DEST, ...subdir.split('/').slice(0, -1)); // <dest>/dsh-desktop/assets
  fs.mkdirSync(prefixRoot, { recursive: true });

  const indexPath = path.join(os.tmpdir(), `eac-src-index-${crypto.randomUUID()}`);
  const env = { ...process.env, GIT_INDEX_FILE: indexPath };
  try {
    // Index entries become "plugins/<pkg>/..." so the checkout prefix below lands them
    // at <dest>/dsh-desktop/assets/plugins/<pkg>/...
    run(['-C', repo, 'read-tree', `--prefix=${path.basename(subdir)}/`, `${tag}:${subdir}`], { env });
    run(
      ['-C', repo, '-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false',
        'checkout-index', '-a', '-f', `--prefix=${prefixRoot.replace(/\\/g, '/')}/`],
      { env, stdio: 'inherit', encoding: undefined },
    );
  } finally {
    fs.rmSync(indexPath, { force: true });
  }
}

const plugins = path.join(DEST, ...subdir.split('/'));
if (!fs.existsSync(plugins)) throw new Error(`[eac-src] no ${subdir} under ${DEST}`);
const dirs = fs.readdirSync(plugins).filter((n) => fs.existsSync(path.join(plugins, n, 'package.json')));
console.log(`[eac-src] ready: ${path.relative(ROOT, plugins)} (${dirs.length} plugin dirs)`);

// Prove the pinned sources still match what the tracked patches expect.
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
let mismatch = 0;
for (const patch of manifest.patches) {
  if (patch.source !== 'eac-tag') continue;
  const dirName = path.basename(patch.name);
  for (const file of patch.files) {
    const p = path.join(plugins, dirName, ...file.path.split('/'));
    if (!fs.existsSync(p)) {
      console.log(`[eac-src] ${dirName}/${file.path}: ABSENT (the patch will fail-closed at repack time)`);
      mismatch++;
      continue;
    }
    const sha = sha256(p);
    const ok = sha === file.inputSha256;
    if (!ok) mismatch++;
    console.log(`[eac-src] ${dirName}/${file.path}: ${ok ? 'MATCHES patch input' : `DIFFERS from patch input (${sha})`}`);
  }
}
if (mismatch) {
  console.error(`[eac-src] ${mismatch} patch input(s) do not match the pinned tag — investigate before repacking`);
  process.exit(1);
}
