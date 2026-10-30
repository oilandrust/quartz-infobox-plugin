import { readdirSync, statSync } from "node:fs"
import path from "node:path"

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i

export function unwrapImageRef(value: string): string {
  let src = value.trim()
  const wiki = /^!?\[\[([\s\S]+)\]\]$/.exec(src)
  if (wiki?.[1]) src = wiki[1]
  const pipe = src.indexOf("|")
  if (pipe >= 0) src = src.slice(0, pipe)
  return src.trim().replace(/^\.\//, "")
}

export function isRemoteAsset(value: string): boolean {
  return /^(https?:)?\/\//i.test(value) || value.startsWith("data:")
}

function preferFolder(hits: string[], noteSlug: string): string {
  const folder = noteSlug.split("/").filter(Boolean).slice(0, -1).join("/").toLowerCase()
  if (!folder) return hits[0] ?? ""
  return hits.find((hit) => hit.toLowerCase().startsWith(`${folder}/`)) ?? hits[0] ?? ""
}

/** Resolve an image the way Obsidian does: exact path, then a unique filename anywhere in the vault. */
export function matchAsset(requested: string, noteSlug: string, assets: string[]): string | undefined {
  const clean = unwrapImageRef(requested).replace(/\\/g, "/")
  if (!clean || isRemoteAsset(clean)) return undefined

  const lower = clean.toLowerCase()
  const exact = assets.find((asset) => asset.toLowerCase() === lower)
  if (exact) return exact

  const bySuffix = assets.filter((asset) => asset.toLowerCase().endsWith(`/${lower}`))
  if (bySuffix.length === 1) return bySuffix[0]
  if (bySuffix.length > 1) return preferFolder(bySuffix, noteSlug)

  if (!lower.includes("/")) {
    const hits = assets.filter((asset) => asset.toLowerCase().split("/").pop() === lower)
    if (hits.length === 1) return hits[0]
    if (hits.length > 1) return preferFolder(hits, noteSlug)
  }

  return undefined
}

let assetCache: { root: string; files: string[]; at: number } | null = null

export function contentRoot(): string {
  const candidates = [path.resolve(process.cwd(), "content"), path.resolve(process.cwd(), "vault")]
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isDirectory()) return candidate
    } catch {
      // try the next candidate
    }
  }
  return candidates[0] ?? path.resolve(process.cwd(), "content")
}

/** Vault-relative image paths under the Quartz content directory. */
export function listContentAssets(root = contentRoot()): string[] {
  const now = Date.now()
  if (assetCache && assetCache.root === root && now - assetCache.at < 1500) return assetCache.files

  const files: string[] = []
  const walk = (dir: string) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue
      const absolute = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(absolute)
      else if (IMAGE_EXT.test(entry.name)) {
        files.push(path.relative(root, absolute).split(path.sep).join("/"))
      }
    }
  }

  walk(root)
  assetCache = { root, files, at: now }
  return files
}
