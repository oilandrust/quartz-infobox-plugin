export interface NoteRef {
  slug?: string
  filePath?: string
  aliases?: string[]
  frontmatter?: {
    title?: string
    aliases?: string[]
  }
}

export interface ResolvedLink {
  href: string
  label: string
  external: boolean
  broken: boolean
}

function simplifySlug(target: string): string {
  const trimmed = target.replace(/^\//, "").replace(/\/index$/, "")
  return trimmed.length > 0 ? trimmed : "index"
}

/** Relative URL from the current page slug to another slug, matching Quartz's path helper. */
export function resolveRelative(current: string, target: string): string {
  const simplified = simplifySlug(target)
  const ups = current
    .split("/")
    .filter((part) => part !== "")
    .slice(0, -1)
    .map(() => "..")
  const root = ups.length === 0 ? "." : ups.join("/")
  return `${root}/${simplified}`.replace(/\/{2,}/g, "/")
}

export function slugTag(tag: string): string {
  return tag
    .trim()
    .replace(/^#+/, "")
    .split("/")
    .map((part) =>
      part
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/&/g, "-and-")
        .replace(/[^\p{L}\p{N}\/_-]+/gu, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, ""),
    )
    .filter(Boolean)
    .join("/")
}

function displayFromTarget(target: string): string {
  const withoutAnchor = target.replace(/[#^].*$/, "")
  const pageName = withoutAnchor.split("/").filter(Boolean).pop()
  return (pageName || target).replace(/\.md$/i, "")
}

function noteKeys(note: NoteRef): string[] {
  const slug = (note.slug ?? "").replace(/\\/g, "/")
  const filePath = (note.filePath ?? "").replace(/\\/g, "/")
  const stem = filePath.replace(/\.md$/i, "").split("/").pop() ?? ""
  const title = note.frontmatter?.title ?? ""
  const aliases = [...(note.frontmatter?.aliases ?? []), ...(note.aliases ?? [])]
  return [slug, slug.split("/").pop() ?? "", stem, title, ...aliases].filter(Boolean)
}

function findNote(target: string, currentSlug: string, notes: NoteRef[]): NoteRef | undefined {
  const needle = target.replace(/\\/g, "/").replace(/\.md$/i, "").replace(/^\//, "")
  const needleLower = needle.toLowerCase()
  const stem = needleLower.split("/").pop() ?? needleLower
  const folder = currentSlug.split("/").filter(Boolean).slice(0, -1).join("/").toLowerCase()

  let best: { note: NoteRef; score: number } | undefined
  for (const note of notes) {
    const slug = (note.slug ?? "").toLowerCase()
    const filePath = (note.filePath ?? "").replace(/\\/g, "/").toLowerCase()
    const keys = noteKeys(note).map((key) => key.toLowerCase())
    let score = 0
    if (slug === needleLower || filePath.endsWith(`/${needleLower}.md`) || filePath.endsWith(`/${needleLower}`)) {
      score = 100
    } else if (slug.endsWith(`/${needleLower}`)) score = 90
    else if (keys.includes(needleLower) || keys.includes(stem)) score = 80
    else continue

    if (folder && slug.startsWith(`${folder}/`)) score += 5
    if (!best || score > best.score) best = { note, score }
  }
  return best?.note
}

export function resolveWikilink(
  raw: string,
  currentSlug: string,
  notes: NoteRef[],
): ResolvedLink {
  let body = raw.trim()
  let alias: string | undefined
  const pipe = body.indexOf("|")
  if (pipe >= 0) {
    alias = body.slice(pipe + 1).trim()
    body = body.slice(0, pipe).trim()
  }

  let hash = ""
  const anchor = body.search(/[#^]/)
  if (anchor >= 0) {
    const anchorText = body.slice(anchor)
    hash = anchorText.startsWith("#") ? anchorText : `#${anchorText}`
    body = body.slice(0, anchor).trim()
  }

  if (/^(https?:)?\/\//i.test(body) || body.startsWith("mailto:")) {
    return { href: body, label: alias || body, external: true, broken: false }
  }

  const note = findNote(body, currentSlug, notes)
  const label = alias || displayFromTarget(body)
  if (!note?.slug) {
    const guess = body
      .split("/")
      .map((part) => part.trim().toLowerCase().replace(/\s+/g, "-"))
      .filter(Boolean)
      .join("/")
    return {
      href: `${resolveRelative(currentSlug, guess || "missing")}${hash}`,
      label: alias || displayFromTarget(body),
      external: false,
      broken: true,
    }
  }

  return {
    href: `${resolveRelative(currentSlug, note.slug)}${hash}`,
    label,
    external: false,
    broken: false,
  }
}

export function resolveTagHref(tag: string, currentSlug: string): string {
  return resolveRelative(currentSlug, `tags/${slugTag(tag)}`)
}

export function resolveAssetHref(assetPath: string, currentSlug: string): string {
  return resolveRelative(currentSlug, assetPath)
}
