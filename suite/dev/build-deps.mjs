/**
 * dev-only: bundle react + react-dom into a single IIFE file for the preview
 * page. Uses the devDependencies (react, esbuild) — never shipped: package.json
 * `files` does not include dev/, and this file is not part of the runtime.
 *
 * Usage: npm i -D react react-dom esbuild --prefix suite && node suite/dev/build-deps.mjs
 */
import esbuild from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const outfile = path.join(here, 'vendor', 'react.iife.js')

fs.mkdirSync(path.dirname(outfile), { recursive: true })

await esbuild.build({
  entryPoints: [path.join(here, 'react-entry.js')],
  bundle: true,
  format: 'iife',
  outfile,
  minify: true,
  sourcemap: false,
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"' },
})

console.log(`[dev] vendor bundle written: ${outfile}`)
