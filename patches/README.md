# patches/ — tracked source patches replayed by the repack pipeline

This directory is the **fact source** for local fixes we ship on top of upstream
plugin sources. It exists so a rebuild cannot silently drop them: without it the
fixes live only inside `dist/*.tgz`, which is gitignored, and the next
`repack.mjs` run would re-emit the unfixed upstream code.

## Layout

```
patches/
  source-patches.json                       manifest: base pin + per-file hashes
  files/<package>/<relative path>.diff      unified diff, `git apply -p1` compatible
  README.md
```

`source-patches.json` shape:

```jsonc
{
  "schemaVersion": 1,
  "applicator": "git-apply -p1 (core.autocrlf=false)",
  "base": { "eac": { "repo": "...", "tag": "v5.3.6", "subdir": "dsh-desktop/assets/plugins" } },
  "patches": [
    {
      "name": "@deepseek-ai/dsh-balance",   // must equal the catalog package name
      "version": "0.1.0",                   // must equal the catalog version
      "source": "eac-tag",
      "files": [
        {
          "path": "lib/client.js",          // relative to the extracted package root
          "diff": "files/@deepseek-ai_dsh-balance/lib/client.js.diff",
          "inputSha256":  "<hash of the unpatched file>",
          "outputSha256": "<hash after the patch>",
          "note": "why this fix exists (copied into dist/index.json repackNote)"
        }
      ]
    }
  ]
}
```

## How it runs

`scripts/repack/repack.mjs` calls `applySourcePatches()` immediately after a
package is materialized and before `npm pack`. For every entry listed for that
package, the replay is **fail-closed**:

1. the materialized file must hash to `inputSha256` — otherwise the build stops
   (upstream drifted; regenerate the patch or re-pin the base);
2. the tracked diff is applied with `git apply -p1` and `core.autocrlf=false`
   so bytes are not line-ending translated;
3. the result must hash to `outputSha256` — otherwise the build stops.

Packages without an entry are untouched. When a patch is applied,
`dist/index.json` records `locallyRepacked: true` plus `repackNote`, which
propagates into `suite/assets/bootstrap.json`.

### The `eac-tag` base pin

`repack.mjs` reads `source: "eac-tag"` packages from
`.cache/eac-src/dsh-desktop/assets/plugins`, which nothing else creates. Populate it with:

```bash
# offline (recommended, uses a local clone that has the tag)
EAC_SRC_LOCAL=/path/to/DSH-Desktop-EAC node scripts/repack/fetch-eac-src.mjs --force
# or over the network
node scripts/repack/fetch-eac-src.mjs --force
```

`fetch-eac-src.mjs` uses a temporary Git index (`read-tree --prefix` and
`checkout-index`, with `core.autocrlf=false`; no CRLF translation) and then
prints whether each pinned file still matches the `inputSha256` the patches expect.

This pin matters: the EAC main repository **deliberately deleted**
`dsh-desktop/assets/plugins` at HEAD (ADR 0006 v4, commit `6687b40`
"剥离文件连同源码删除"), so these sources now exist only at the recorded tag.
Do not re-add them to the main repository — that contradicts that decision; the
fixes belong to the distribution layer, i.e. here.

## Current patches

| Package | Source | File | Fix |
| --- | --- | --- | --- |
| `dsh-settings-groups@0.1.0` | `eac-tag` | `lib/client.js` | General-settings collapser: real rows are the slot wrapper's children, not the wrapper itself (previously the whole page was hidden as a single "advanced" row). |
| `@deepseek-ai/dsh-balance@0.1.0` | `eac-tag` | `lib/client.js` | Drops the 价格设置 settings section. Its `balancePrices` / `balanceModels` / `refreshBalance` bridge is retired by ADR 0006 (`docs/adr/0006-minimal-core-scope.md:373-376`, locked by `bridge-preload-parity.test.ts`), so the section could only ever render a misleading "bridge unavailable" error. The composer dock is unchanged. |
| `dsh-plugin-wallpaper-engine@0.6.7` | `npm` | `lib/client.js` | Update-notice button contrast. `.we-picker__btn` inherits light-theme tokens that render near-black on the dark glass notice card (outline 1.10:1, label 1.06:1). Pin light values → outline 3.11:1, label 4.95:1 (WCAG 4.5 text / 3.0 non-text). |

## Adding or regenerating a patch

1. Edit the extracted package source until it behaves correctly.
2. Produce the patch from the **unpatched** and **patched** file so
   `inputSha256`/`outputSha256` are both recorded:

   ```bash
   git diff --no-index --src-prefix=a/ --dst-prefix=b/ unpatched/lib/client.js patched/lib/client.js
   ```

   Then rewrite the two header paths to `a/lib/client.js` / `b/lib/client.js`
   (they must be relative to the extracted package root so `-p1` works).
3. Add the entry to `source-patches.json` with both hashes and a `note`.
4. Prove the round trip: unpatched + diff must equal patched. A rebuild is the
   real test — `repack.mjs` fails loudly if the hashes do not line up.

Keep patches minimal and surgical. Do not use this mechanism to fork a package's
behaviour wholesale; if a package needs a real fork, publish it as its own
package instead.

## Provenance and licensing

Upstream origins are recorded per package in `catalog/*.json` (`upstream` field)
and remain the property of their authors; these diffs are our local fixes to
byte-identical upstream sources and carry the same license as the package they
patch (`MIT` for all three above, and `SEE LICENSE IN ASSET_LICENSE.md` where the
package declares assets — not applicable to the files patched here).
