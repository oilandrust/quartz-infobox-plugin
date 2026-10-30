/** Split on a delimiter only when it sits outside wikilinks, markdown links, and quotes. */
export function splitOutsideLinks(str: string, delimiter: string): string[] {
  const tokens: string[] = []
  let current = ""
  let inWikilink = 0
  let inBracket = 0
  let inParen = 0
  let inQuote: string | null = null

  for (let i = 0; i < str.length; i++) {
    const ch = str[i] ?? ""
    const next = str[i + 1]

    if ((ch === '"' || ch === "'") && inWikilink === 0 && inBracket === 0 && inParen === 0) {
      if (inQuote === ch) inQuote = null
      else if (inQuote === null) inQuote = ch
      current += ch
      continue
    }

    if (inQuote !== null) {
      current += ch
      continue
    }

    if (ch === "[" && next === "[") {
      inWikilink++
      current += "[["
      i++
      continue
    }
    if (ch === "]" && next === "]") {
      if (inWikilink > 0) inWikilink--
      current += "]]"
      i++
      continue
    }

    if (inWikilink === 0) {
      if (ch === "[") inBracket++
      else if (ch === "]") {
        if (inBracket > 0) inBracket--
      } else if (ch === "(" && inBracket === 0) inParen++
      else if (ch === ")") {
        if (inParen > 0) inParen--
      }
    }

    if (
      ch === delimiter &&
      inWikilink === 0 &&
      inBracket === 0 &&
      inParen === 0 &&
      inQuote === null
    ) {
      if (current.trim().length > 0) tokens.push(current.trim())
      current = ""
    } else {
      current += ch
    }
  }

  if (current.trim().length > 0) tokens.push(current.trim())
  return tokens.filter(Boolean)
}

function isBulletLine(line: string): boolean {
  return /^[-+•]\s+|^\*\s+|^\d+[.)]\s+/.test(line)
}

function isLinkToken(value: string): boolean {
  const trimmed = value.trim()
  return /^!?\[\[.*\]\]$/.test(trimmed) || /^\[.*\]\(.*\)$/.test(trimmed)
}

/**
 * Turn a field value into list items the same way Omni Infobox does:
 * YAML arrays, bullet lines, pipes, commas (except dates and sentences), then semicolons.
 * A single-item result means "render as running text".
 */
export function extractListItems(value: unknown): string[] {
  if (value == null) return []
  if (Array.isArray(value)) {
    return value.map((item) => normalizeInlineValue(item)).filter(Boolean)
  }
  if (typeof value !== "string") return [String(value)]

  const str = value.trim()
  if (!str) return []

  if (str.includes("\n")) {
    const rawLines = str
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
    const hasBulletPrefix = rawLines.length > 1 && rawLines.every(isBulletLine)
    if (hasBulletPrefix) {
      return rawLines
        .map((line) => line.replace(/^[-+•]\s+|^\*\s+|^\d+[.)]\s+/, "").trim())
        .filter(Boolean)
    }
    return [str]
  }

  const pipeParts = splitOutsideLinks(str, "|")
  if (pipeParts.length > 1) return pipeParts

  const commaParts = splitOutsideLinks(str, ",")
  if (commaParts.length > 1) {
    const allLinks = commaParts.every(isLinkToken)
    const isDate =
      /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s*\d{4}\b/i.test(
        str,
      ) || /\b\d{1,2},\s*\d{4}\b/.test(str)
    const isFormattedSentence = str.includes(":") || /^\*\*|^\*|^_/.test(str)
    if (allLinks || (!isDate && !isFormattedSentence)) return commaParts
  }

  const semiParts = splitOutsideLinks(str, ";")
  if (semiParts.length > 1) return semiParts

  return [str]
}

/** Repair values that YAML parsed as arrays because a wikilink was left unquoted. */
export function normalizeInlineValue(value: unknown): string {
  if (value == null) return ""

  if (Array.isArray(value)) {
    if (value.length === 1) {
      const inner = value[0]
      if (Array.isArray(inner) && inner.length === 1 && inner[0] != null && typeof inner[0] !== "object") {
        const text = String(inner[0]).trim()
        return text.startsWith("[[") && text.endsWith("]]") ? text : `[[${text}]]`
      }
      if (typeof inner === "string") {
        const text = inner.trim()
        return text.startsWith("[[") && text.endsWith("]]") ? text : `[[${text}]]`
      }
    }

    return value
      .map((item) => {
        if (Array.isArray(item) && item.length === 1 && item[0] != null && typeof item[0] !== "object") {
          const text = String(item[0]).trim()
          return text.startsWith("[[") && text.endsWith("]]") ? text : `[[${text}]]`
        }
        return normalizeInlineValue(item)
      })
      .join(", ")
  }

  return String(value)
}

export function normalizeTags(value: unknown): string[] {
  const tags: string[] = []
  const seen = new Set<string>()

  const addTag = (raw: unknown) => {
    if (raw == null) return
    if (Array.isArray(raw)) {
      raw.forEach(addTag)
      return
    }
    if (typeof raw === "object") {
      const record = raw as { tag?: unknown; name?: unknown }
      addTag(record.tag ?? record.name ?? "")
      return
    }

    const parts = String(raw)
      .split(/[\s,]+/)
      .map((tag) => tag.trim().replace(/^#+/, "").replace(/,+$/, ""))
      .filter(Boolean)

    for (const tag of parts) {
      const key = tag.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      tags.push(tag)
    }
  }

  addTag(value)
  return tags
}

export interface InfoboxImage {
  label: string
  image: string
  caption: string
}

export interface InfoboxSection {
  kind: "section"
  label: string
}

export interface InfoboxRow {
  kind: "row"
  label: string
  value: unknown
}

export type InfoboxField = InfoboxSection | InfoboxRow

export interface InfoboxData {
  supertitle?: string
  title?: string
  subtitle?: string
  images: InfoboxImage[]
  tags: string[]
  fields: InfoboxField[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function readInfobox(
  frontmatter: Record<string, unknown> | undefined,
  options: { fallbackToNoteTags: boolean },
): InfoboxData | null {
  const box = asRecord(frontmatter?.infobox)
  if (!box) return null

  const images: InfoboxImage[] = []
  if (Array.isArray(box.images)) {
    for (const entry of box.images) {
      const record = asRecord(entry)
      const image = record ? asText(record.image) : undefined
      if (!record || !image) continue
      images.push({
        label: asText(record.label) ?? "",
        image,
        caption: asText(record.caption) ?? "",
      })
    }
  }
  if (images.length === 0 && asText(box.image)) {
    images.push({
      label: "",
      image: asText(box.image) ?? "",
      caption: asText(box.caption) ?? "",
    })
  }

  let tags: string[] = []
  if (box.showTags !== false) {
    if (box.tags != null) tags = normalizeTags(box.tags)
    else if (options.fallbackToNoteTags && frontmatter?.tags != null) tags = normalizeTags(frontmatter.tags)
  }

  const fields: InfoboxField[] = []
  if (Array.isArray(box.fields)) {
    for (const item of box.fields) {
      const record = asRecord(item)
      if (!record) continue
      const key = Object.keys(record)[0]
      if (!key) continue
      const value = record[key]
      if (key.toLowerCase() === "section") {
        const label = normalizeInlineValue(value).trim()
        if (label) fields.push({ kind: "section", label })
      } else {
        fields.push({ kind: "row", label: key, value })
      }
    }
  }

  const data: InfoboxData = {
    supertitle: asText(box.supertitle),
    title: asText(box.title),
    subtitle: asText(box.subtitle),
    images,
    tags,
    fields,
  }

  const hasContent = Boolean(
    data.supertitle || data.title || data.subtitle || data.images.length || data.tags.length || data.fields.length,
  )
  return hasContent ? data : null
}

export interface RichBlock {
  type: "heading" | "list" | "paragraph"
  level?: number
  text?: string
  items?: string[]
}

/** Headings and mixed lists inside a YAML block scalar. Plain multiline text stays one paragraph. */
export function parseRichBlocks(value: string): RichBlock[] | null {
  if (!value.includes("\n")) return null
  if (!/^#{1,6}\s+/m.test(value) && !/^\s*[-+*]\s+/m.test(value)) return null

  const blocks: RichBlock[] = []
  const lines = value.split(/\r?\n/)
  let index = 0

  while (index < lines.length) {
    const raw = lines[index] ?? ""
    const line = raw.trim()
    if (!line) {
      index++
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({ type: "heading", level: heading[1]?.length ?? 4, text: heading[2] ?? "" })
      index++
      continue
    }

    if (isBulletLine(line)) {
      const items: string[] = []
      while (index < lines.length && isBulletLine((lines[index] ?? "").trim())) {
        items.push((lines[index] ?? "").trim().replace(/^[-+•]\s+|^\*\s+|^\d+[.)]\s+/, "").trim())
        index++
      }
      blocks.push({ type: "list", items: items.filter(Boolean) })
      continue
    }

    const paragraph: string[] = []
    while (index < lines.length) {
      const next = (lines[index] ?? "").trim()
      if (!next || /^(#{1,6})\s+/.test(next) || isBulletLine(next)) break
      paragraph.push(next)
      index++
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") })
  }

  return blocks.length > 0 ? blocks : null
}
