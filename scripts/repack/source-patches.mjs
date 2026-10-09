/**
 * Tracked source-patch replay for the repack pipeline.
 *
 * Why this exists
 * ---------------
 * Some shipped plugins need a local fix that upstream does not carry yet (see
 * patches/README.md). Those fixes MUST survive a rebuild: if they only live in
 * dist/*.tgz — which is gitignored — anyone re-running the pipeline silently
 * reverts them. This module replays them from the tracked fact source
 * patches/source-patches.json.
 *
 * Contract (fail-closed)
 * ----------------------
 * For every patch file, in order:
 *   1. the materialized staging file MUST hash to `inputSha256`, else throw;
 *   2. the tracked unified diff is applied with `git apply -p1` and
 *      core.autocrlf disabled (byte-exact);
 *   3. the result MUST hash to `outputSha256`, else throw.
 * A drifted upstream therefore fails the build loudly instead of shipping a
 * half-applied fix.
 *
 * Why the patch is applied in a scratch directory
 * ----------------------------------------------
 * repack.mjs stages inside `<repo>/.cache/...`, which .gitignore excludes.
 * `git apply` run from inside that repository treats such paths as ignored and
 * exits 0 while changing nothing — a silent no-op that would look like success.
 * The diff is therefore applied in a scratch directory outside any repository
 * and the verified result is copied back.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const MANIFEST = path.join(ROOT, 'patches', 'source-patches.json');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

export function loadPatchManifest() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (manifest.schemaVersion !== 1) {
    throw new Error(`unsupported source-patches schemaVersion: ${manifest.schemaVersion}`);
  }
  if (!Array.isArray(manifest.patches)) throw new Error('source-patches.json: patches[] missing');
  return manifest;
}

/**
 * @returns {Array<{path:string, sha256:string, note:string}>} applied files (empty when none apply)
 */
export function applySourcePatches(entry, staging, log = console.log) {
  const manifest = loadPatchManifest();
  const patch = manifest.patches.find((p) => p.name === entry.name);
  if (!patch) return [];
  if (patch.version !== entry.version) {
    throw new Error(
      `source patch version mismatch for ${entry.name}: manifest=${patch.version} catalog=${entry.version}`,
    );
  }

  const applied = [];
  const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eac-src-patch-'));
  try {
    for (const file of patch.files) {
      if (!file.path || file.path.includes('..') || path.isAbsolute(file.path)) {
        throw new Error(`unsafe patch path: ${String(file.path)}`);
      }
      const target = path.join(staging, ...file.path.split('/'));
      if (!fs.existsSync(target)) {
        throw new Error(`source patch target missing: ${entry.name} ${file.path}`);
      }

      const beforeSha = sha256(fs.readFileSync(target));
      if (beforeSha !== file.inputSha256) {
        throw new Error(
          `source patch input mismatch for ${entry.name} ${file.path}\n` +
            `  expected ${file.inputSha256}\n  actual   ${beforeSha}\n` +
            '  upstream source drifted -> regenerate patches/ or re-pin the base',
        );
      }

      const diffPath = path.join(ROOT, 'patches', ...file.diff.split('/'));
      if (!fs.existsSync(diffPath)) throw new Error(`source patch diff missing: ${file.diff}`);

      // Apply outside the repository (see the header note), then copy the verified result back.
      const scratchFile = path.join(scratchRoot, ...file.path.split('/'));
      fs.mkdirSync(path.dirname(scratchFile), { recursive: true });
      fs.copyFileSync(target, scratchFile);
      try {
        execFileSync(
          'git',
          ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false',
            'apply', '--whitespace=nowarn', '-p1', diffPath],
          { cwd: scratchRoot, stdio: ['ignore', 'pipe', 'pipe'] },
        );
      } catch (err) {
        const stderr = err && err.stderr ? String(err.stderr) : '';
        throw new Error(`git apply failed for ${entry.name} ${file.path}: ${stderr.trim() || err.message}`);
      }

      const after = fs.readFileSync(scratchFile);
      const afterSha = sha256(after);
      if (afterSha !== file.outputSha256) {
        throw new Error(
          `source patch output mismatch for ${entry.name} ${file.path}\n` +
            `  expected ${file.outputSha256}\n  actual   ${afterSha}`,
        );
      }
      fs.writeFileSync(target, after);

      applied.push({ path: file.path, sha256: afterSha, note: file.note });
      log(`  source-patch ${entry.name}: ${file.path} -> ${afterSha.slice(0, 12)}`);
    }
  } finally {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  }
  return applied;
}
