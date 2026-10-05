/** Sync only lightweight entrypoint files; build registry resources in ignored staging. */
import fs from 'node:fs'
import path from 'node:path'
import { buildResources } from '../../scripts/build-resources.mjs'
const root = path.resolve(import.meta.dirname, '..', '..')
fs.copyFileSync(path.join(root, 'README.md'), path.join(root, 'suite/README.md'))
for (const pack of ['eac', 'aio', 'skins', 'community', 'retired']) {
  const src = path.join(root, 'catalog', `${pack}.json`)
  if (!fs.existsSync(src)) { if (pack === 'retired') continue; throw new Error('missing catalog: ' + pack) }
  fs.mkdirSync(path.join(root, 'suite/catalog'), { recursive: true })
  fs.copyFileSync(src, path.join(root, 'suite/catalog', `${pack}.json`))
}
console.log('[sync] required registry resource package', buildResources(root))
