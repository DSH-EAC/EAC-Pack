/**
 * Sync build assets into the suite package:
 *   ../catalog/*.json   -> catalog/
 *   ../dist/*           -> assets/dist/  (repacked tarballs + index + checksums)
 *
 * Run before `npm pack` of the suite so the published tarball is fully
 * offline-capable. Fails loudly when the catalog is missing but never blocks
 * on dist absence (dev mode still works against registry specs).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const suite = path.join(root, 'suite')
const catalogOut = path.join(suite, 'catalog')
const distOut = path.join(suite, 'assets', 'dist')

for (const pack of ['eac', 'aio', 'skins', 'retired']) {
  const src = path.join(root, 'catalog', `${pack}.json`)
  if (!fs.existsSync(src)) {
    if (pack === 'retired') continue
    console.error(`[sync] missing catalog/${pack}.json — run the asset pipeline first`)
    process.exitCode = 1
    continue
  }
  fs.mkdirSync(catalogOut, { recursive: true })
  fs.copyFileSync(src, path.join(catalogOut, `${pack}.json`))
  console.log(`[sync] catalog/${pack}.json`)
}

if (fs.existsSync(path.join(root, 'dist'))) {
  fs.mkdirSync(distOut, { recursive: true })
  for (const name of fs.readdirSync(path.join(root, 'dist'))) {
    if (!/\.(tgz|json|txt|md)$/.test(name)) continue
    fs.copyFileSync(path.join(root, 'dist', name), path.join(distOut, name))
  }
  const n = fs.readdirSync(distOut).filter((f) => f.endsWith('.tgz')).length
  console.log(`[sync] assets/dist: ${n} tarballs copied`)
} else {
  console.warn('[sync] dist/ not present — suite will fall back to registry specs')
}
