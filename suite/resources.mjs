import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.items) || !manifest.items.length || !manifest.resourceVersion) {
    throw new Error('invalid resource manifest')
  }
  const seen = new Set(), files = new Set()
  for (const item of manifest.items) {
    if (!item.name || !item.version || !/^[@a-zA-Z0-9][@a-zA-Z0-9._-]*\.tgz$/.test(item.file ?? '') || item.file.includes('..') ||
        !/^[a-f0-9]{64}$/.test(item.sha256 ?? '') || item.sha256 === '0'.repeat(64) || !Number.isSafeInteger(item.bytes) || item.bytes <= 0) {
      throw new Error(`invalid resource: ${item.file ?? item.name ?? 'unknown'}`)
    }
    const key = `${item.name}@${item.version}`
    if (seen.has(key) || files.has(item.file)) throw new Error(`duplicate resource: ${key}`)
    if (item.parts !== undefined) {
      if (!Array.isArray(item.parts) || !item.parts.length || item.parts.reduce((n, p) => n + p.bytes, 0) !== item.bytes) throw new Error('invalid resource parts')
      for (const part of item.parts) {
        if (!/^[a-zA-Z0-9@._-]+$/.test(part.file ?? '') || part.file.includes('..') || !Number.isSafeInteger(part.bytes) || part.bytes <= 0 || !/^[a-f0-9]{64}$/.test(part.sha256 ?? '')) throw new Error('unsafe resource part')
      }
    }
    seen.add(key); files.add(item.file)
  }
  if (manifest.assetPackage !== undefined) {
    if (manifest.assetPackage.name !== 'eac-plugin-suite-assets' || manifest.assetPackage.version !== manifest.resourceVersion || !Array.isArray(manifest.extraFiles) || !manifest.extraFiles.some(i => i.file === 'gallery.json')) throw new Error('invalid asset package contract')
    const extras = new Set()
    for (const item of manifest.extraFiles) {
      if (!/^(gallery\.json|(?:previews|prompts)\/[a-z0-9-]+\/[a-zA-Z0-9.-]+)$/.test(item.file ?? '') || item.file.includes('..') || extras.has(item.file) || !Number.isSafeInteger(item.bytes) || item.bytes <= 0 || !/^[a-f0-9]{64}$/.test(item.sha256 ?? '')) throw new Error('unsafe or duplicate gallery asset')
      extras.add(item.file)
    }
  }
  return manifest
}

async function matches(file, item) {
  try {
    const stat = await fs.promises.lstat(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== item.bytes) return false
    const hash = crypto.createHash('sha256')
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk)
    return hash.digest('hex') === item.sha256
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

/** Verify the complete installed payload locally; never fetch missing baseline files. */
export class ResourceManager {
  constructor({ manifest, cacheDir, bundledDir, validateInstall = () => {}, onProgress = () => {} }) {
    this.manifest = validateManifest(manifest)
    this.cacheDir = cacheDir
    this.bundledDir = bundledDir
    this.onProgress = onProgress
    this.validateInstall = validateInstall
    this.abort = new AbortController()
    this.pending = new Map()
    this.completed = new Set()
    this.phase = 'idle'
    this.error = null
    this.run = null
  }

  snapshot() {
    const items = this.manifest.items
    const totalBytes = items.reduce((sum, item) => sum + item.bytes, 0)
    const completedBytes = items.filter(item => this.completed.has(item.file)).reduce((sum, item) => sum + item.bytes, 0)
    return { state: this.phase, mode: 'installed', resourceVersion: this.manifest.resourceVersion,
      total: items.length, completed: this.completed.size, totalBytes, completedBytes, receivedBytes: completedBytes,
      active: [], error: this.error }
  }

  notify() { this.onProgress(this.snapshot()) }
  find(entry) { return this.manifest.items.find(item => item.name === entry.name && item.version === entry.version) }
  cachedPath(item) { return path.join(this.cacheDir, item.sha256, item.file) }

  async local(item) {
    const file = path.join(this.bundledDir, item.file)
    return await matches(file, item) ? file : null
  }

  async verify(item) {
    this.abort.signal.throwIfAborted()
    this.completed.delete(item.file)
    let file
    if (item.parts) {
      const hash = crypto.createHash('sha256')
      for (const part of item.parts) {
        this.abort.signal.throwIfAborted()
        const source = path.join(this.bundledDir, part.file)
        if (!await matches(source, part)) throw new Error(part.file + ': installed resource missing or integrity mismatch; reinstall the complete eac-plugin-suite package')
        for await (const chunk of fs.createReadStream(source)) hash.update(chunk)
      }
      if (hash.digest('hex') !== item.sha256) throw new Error(item.file + ': assembled resource integrity mismatch')
      file = item.parts.length === 1 && item.parts[0].file === item.file ? path.join(this.bundledDir, item.file) : await this.assemble(item)
    } else file = await this.local(item)
    this.abort.signal.throwIfAborted()
    if (!file) {
      this.completed.delete(item.file)
      throw new Error(item.file + ': installed resource missing or integrity mismatch; reinstall the complete eac-plugin-suite package')
    }
    this.completed.add(item.file)
    this.notify()
    return file
  }

  async assemble(item) {
    const dest = this.cachedPath(item)
    if (await matches(dest, item)) return dest
    await fs.promises.mkdir(path.dirname(dest), { recursive: true })
    const tmp = dest + '.' + crypto.randomUUID() + '.part'
    let output
    try {
      output = await fs.promises.open(tmp, 'wx')
      for (const part of item.parts) {
        for await (const chunk of fs.createReadStream(path.join(this.bundledDir, part.file))) {
          this.abort.signal.throwIfAborted()
          // FileHandle.write may write fewer bytes than requested.
          for (let offset = 0; offset < chunk.length;) offset += (await output.write(chunk, offset)).bytesWritten
        }
      }
      await output.close(); output = null
      if (!await matches(tmp, item)) throw new Error(item.file + ': resource changed while assembling')
      this.abort.signal.throwIfAborted()
      await fs.promises.rename(tmp, dest)
      return dest
    } finally { await output?.close(); await fs.promises.rm(tmp, { force: true }) }
  }

  async ensure(entry) {
    const item = this.find(entry)
    if (!item) throw new Error(`no pinned resource for ${entry.name}@${entry.version}; reinstall the complete package`)
    if (!this.pending.has(item.file)) {
      const pending = this.persist(item).catch(error => {
        this.phase = this.abort.signal.aborted ? 'cancelled' : 'failed'
        this.error = String(error.message ?? error)
        this.notify()
        throw error
      }).finally(() => this.pending.delete(item.file))
      this.pending.set(item.file, pending)
    }
    return this.pending.get(item.file)
  }

  async persist(item) {
    await this.validateInstall()
    const source = await this.verify(item)
    const dest = this.cachedPath(item)
    if (await matches(dest, item)) return dest
    this.abort.signal.throwIfAborted()
    await fs.promises.mkdir(path.dirname(dest), { recursive: true })
    const tmp = `${dest}.${crypto.randomUUID()}.part`
    try {
      // Child packages keep file: dependencies; do not tie them to removable node_modules.
      await fs.promises.copyFile(source, tmp)
      this.abort.signal.throwIfAborted()
      if (!await matches(tmp, item)) throw new Error(`${item.file}: resource changed while copying`)
      await fs.promises.rename(tmp, dest)
      return dest
    } finally { await fs.promises.rm(tmp, { force: true }) }
  }

  hydrate() {
    if (this.run) return this.run
    this.phase = 'checking'
    this.completed.clear()
    this.error = null
    this.notify()
    this.run = this.complete().finally(() => { this.run = null })
    return this.run
  }

  async complete() {
    try {
      await this.validateInstall()
      for (const item of this.manifest.items) await this.verify(item)
      this.phase = 'ready'
    } catch (error) {
      this.phase = this.abort.signal.aborted ? 'cancelled' : 'failed'
      this.error = String(error.message ?? error)
    }
    this.notify()
    return this.snapshot()
  }

  dispose() { this.abort.abort() }
}

export const __test = { validateManifest, matches }
