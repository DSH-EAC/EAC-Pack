import path from 'node:path'
import { packAssets, npm, root } from './pack-delivery.mjs'
import { verifyPublishedResources } from './verify-published-resources.mjs'

// Publish data first. The Git entrypoint must never depend on a nonexistent version.
const evidence = await packAssets()
console.log(JSON.stringify({ ...evidence, registry: 'https://registry.npmjs.org/', publish: !process.argv.includes('--dry-run') }, null, 2))
if (!process.argv.includes('--dry-run')) {
  console.log(npm(['whoami', '--registry=https://registry.npmjs.org/'], root).trim())
  console.log(npm(['publish', evidence.file, '--access=public', '--registry=https://registry.npmjs.org/'], path.dirname(evidence.file)))
  console.log(JSON.stringify(await verifyPublishedResources(), null, 2))
}
