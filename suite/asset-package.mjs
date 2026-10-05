import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { validateManifest } from './resources.mjs'

export const ASSET_PACKAGE = 'eac-plugin-suite-assets'
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex')

export function resolveAssetPackage(pkgDir, manifest) {
  validateManifest(manifest)
  const expected = manifest.assetPackage
  if (expected?.name !== ASSET_PACKAGE || expected.version !== manifest.resourceVersion) throw new Error('invalid pinned asset package contract')
  const require = createRequire(path.join(fs.realpathSync(pkgDir), 'package.json'))
  let metadata
  try { metadata = require.resolve(`${ASSET_PACKAGE}/package.json`) }
  catch { throw new Error(`required ${ASSET_PACKAGE}@${expected.version} is missing; reinstall eac-plugin-suite with its dependencies`) }
  const pkg = JSON.parse(fs.readFileSync(metadata, 'utf8'))
  if (pkg.name !== expected.name || pkg.version !== expected.version) throw new Error('installed asset package identity/version mismatch')
  const assets = path.join(path.dirname(metadata), 'assets')
  assertAssetContract(assets, manifest)
  return assets
}

export function assertAssetContract(assets, manifest) {
  for (const dir of [assets, path.join(assets, 'payload')]) {
    const stat = fs.lstatSync(dir)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('invalid asset package directory')
  }
  for (const file of [path.join(assets, '..', 'package.json'), path.join(assets, 'bootstrap.json')]) {
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('invalid asset package metadata')
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(assets, '..', 'package.json'), 'utf8'))
  if (pkg.scripts || pkg.dependencies || pkg.optionalDependencies || pkg.peerDependencies || pkg.dsh || pkg.private) throw new Error('resource package must be pure publishable data')
  if (pkg.name !== manifest.assetPackage?.name || pkg.version !== manifest.resourceVersion) throw new Error('installed asset package identity/version mismatch')
  const actual = JSON.parse(fs.readFileSync(path.join(assets, 'bootstrap.json'), 'utf8'))
  if (JSON.stringify(actual) !== JSON.stringify(manifest)) throw new Error('installed asset manifest does not match the pinned entrypoint manifest')
}

export function readVerifiedAsset(assets, manifest, file) {
  const item = manifest.extraFiles?.find(item => item.file === file)
  if (!item) throw new Error('asset is not pinned: ' + file)
  if (!/^(gallery\.json|(?:previews|prompts)\/[a-z0-9-]+\/[a-zA-Z0-9.-]+)$/.test(file) || file.includes('..')) throw new Error('unsafe asset path')
  const segments = file.split('/')
  for (let i = 1; i < segments.length; i++) {
    const parent = fs.lstatSync(path.join(assets, ...segments.slice(0, i)))
    if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error('invalid asset directory: ' + file)
  }
  const target = path.join(assets, ...segments)
  const stat = fs.lstatSync(target)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('invalid asset file: ' + file)
  const bytes = fs.readFileSync(target)
  if (bytes.length !== item.bytes || digest(bytes) !== item.sha256) throw new Error('asset integrity mismatch: ' + file)
  return bytes
}

export function verifyAssetPackage(assets, manifest) {
  assertAssetContract(assets, manifest)
  for (const item of manifest.extraFiles ?? []) readVerifiedAsset(assets, manifest, item.file)
}
