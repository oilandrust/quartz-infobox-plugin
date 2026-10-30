import type { JSX } from "preact"
import type { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "@quartz-community/types"
import { isRemoteAsset, listContentAssets, matchAsset, unwrapImageRef } from "../lib/assets"
import { resolveAssetHref, resolveTagHref, resolveWikilink, type NoteRef } from "../lib/links"
import {
  extractListItems,
  parseRichBlocks,
  readInfobox,
  type InfoboxData,
  type RichBlock,
} from "../lib/text"

export interface InfoboxOptions {
  /** When `infobox.tags` is omitted, show the note's own frontmatter tags. */
  fallbackToNoteTags?: boolean
}

const defaultOptions: Required<InfoboxOptions> = {
  fallbackToNoteTags: true,
}

interface LinkContext {
  slug: string
  notes: NoteRef[]
  assets: string[]
}

type InlineNode =
  | { kind: "text"; value: string }
  | { kind: "strong" | "em" | "code"; value: string }
  | { kind: "link"; label: string; href: string; className: string; external: boolean }
  | { kind: "image"; src: string; alt: string }

const INLINE =
  /!\[\[([\s\S]+?)\]\]|\[\[([\s\S]+?)\]\]|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\*([^*]+)\*|_([^_]+)_/g

function classNames(...values: Array<string | false | undefined>): string {
  return values.filter(Boolean).join(" ")
}

function plainText(value: string): string {
  return value
    .replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, alias?: string) => {
      if (alias?.trim()) return alias.trim()
      return target.split("/").filter(Boolean).pop() ?? target
    })
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
}

function notesFrom(allFiles: QuartzComponentProps["allFiles"]): NoteRef[] {
  return allFiles.map((file) => {
    const frontmatter = file.frontmatter as NoteRef["frontmatter"] | undefined
    const aliases = (file as { aliases?: string[] }).aliases
    return {
      slug: file.slug ? String(file.slug) : undefined,
      filePath: file.filePath ? String(file.filePath) : undefined,
      aliases,
      frontmatter,
    }
  })
}

function tokenize(text: string, ctx: LinkContext): InlineNode[] {
  const nodes: InlineNode[] = []
  INLINE.lastIndex = 0
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = INLINE.exec(text))) {
    const index = match.index
    if (index > cursor) nodes.push({ kind: "text", value: text.slice(cursor, index) })

    if (match[1]) {
      const src = unwrapImageRef(`![[${match[1]}]]`)
      nodes.push(imageOrLink(src, ctx))
    } else if (match[2]) {
      nodes.push(linkNode(match[2], ctx))
    } else if (match[3] && match[4]) {
      const target = match[4].trim()
      if (isRemoteAsset(target) || target.startsWith("mailto:")) {
        nodes.push({
          kind: "link",
          label: match[3],
          href: target,
          className: "external",
          external: true,
        })
      } else {
        nodes.push(linkNode(`${target}|${match[3]}`, ctx))
      }
    } else if (match[5] || match[6]) {
      nodes.push({ kind: "strong", value: match[5] || match[6] || "" })
    } else if (match[7]) {
      nodes.push({ kind: "code", value: match[7] })
    } else if (match[8] || match[9]) {
      nodes.push({ kind: "em", value: match[8] || match[9] || "" })
    }

    cursor = index + match[0].length
  }

  if (cursor < text.length) nodes.push({ kind: "text", value: text.slice(cursor) })
  return nodes
}

function imageOrLink(raw: string, ctx: LinkContext): InlineNode {
  if (isRemoteAsset(raw)) return { kind: "image", src: raw, alt: "" }
  if (/\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(raw)) {
    const asset = matchAsset(raw, ctx.slug, ctx.assets) ?? raw
    return { kind: "image", src: resolveAssetHref(asset, ctx.slug), alt: raw }
  }
  return linkNode(raw, ctx)
}

function linkNode(raw: string, ctx: LinkContext): InlineNode {
  const link = resolveWikilink(raw, ctx.slug, ctx.notes)
  return {
    kind: "link",
    label: link.label,
    href: link.href,
    className: classNames("infobox-link", link.external ? "external" : "internal", link.broken && "broken"),
    external: link.external,
  }
}

function Inline({ text, ctx }: { text: string; ctx: LinkContext }) {
  const nodes = tokenize(text, ctx)
  return (
    <>
      {nodes.map((node, index) => {
        if (node.kind === "text") return <span key={index}>{node.value}</span>
        if (node.kind === "strong") return <strong key={index}>{node.value}</strong>
        if (node.kind === "em") return <em key={index}>{node.value}</em>
        if (node.kind === "code") return <code key={index}>{node.value}</code>
        if (node.kind === "image") return <img key={index} src={node.src} alt={node.alt} />
        if (node.kind !== "link") return null
        return (
          <a
            key={index}
            href={node.href}
            class={node.className}
            {...(node.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {node.label}
          </a>
        )
      })}
    </>
  )
}

function FieldValue({ value, ctx }: { value: unknown; ctx: LinkContext }) {
  const items = extractListItems(value)
  if (items.length > 1) {
    return (
      <ul class="infobox-list">
        {items.map((item, index) => (
          <li key={index}>
            <Inline text={item} ctx={ctx} />
          </li>
        ))}
      </ul>
    )
  }

  const text = items[0] ?? ""
  const blocks = parseRichBlocks(text)
  if (!blocks) return <Inline text={text} ctx={ctx} />
  return (
    <>
      {blocks.map((block, index) => (
        <RichBlockView key={index} block={block} ctx={ctx} />
      ))}
    </>
  )
}

function RichBlockView({ block, ctx }: { block: RichBlock; ctx: LinkContext }) {
  if (block.type === "heading") {
    const level = Math.min(Math.max(block.level ?? 4, 1), 6)
    const Tag = `h${level}` as keyof JSX.IntrinsicElements
    return (
      <Tag>
        <Inline text={block.text ?? ""} ctx={ctx} />
      </Tag>
    )
  }
  if (block.type === "list") {
    return (
      <ul class="infobox-list">
        {(block.items ?? []).map((item, index) => (
          <li key={index}>
            <Inline text={item} ctx={ctx} />
          </li>
        ))}
      </ul>
    )
  }
  return (
    <p>
      <Inline text={block.text ?? ""} ctx={ctx} />
    </p>
  )
}

function ImageGallery({ box, ctx }: { box: InfoboxData; ctx: LinkContext }) {
  if (box.images.length === 0) return null
  const multiple = box.images.length > 1

  return (
    <div class="infobox-gallery">
      {multiple && (
        <div class="infobox-image-tabs" role="tablist">
          {box.images.map((image, index) => (
            <button
              key={image.label || image.image}
              type="button"
              class={classNames("infobox-image-tab", index === 0 && "is-active")}
              role="tab"
              aria-selected={index === 0 ? "true" : "false"}
              data-index={index}
            >
              {image.label || `Image ${index + 1}`}
            </button>
          ))}
        </div>
      )}
      {box.images.map((image, index) => {
        const raw = unwrapImageRef(image.image)
        const src = isRemoteAsset(raw)
          ? raw
          : resolveAssetHref(matchAsset(raw, ctx.slug, ctx.assets) ?? raw, ctx.slug)
        const alt = plainText(image.caption || image.label || box.title || "")
        return (
          <div key={`${image.image}-${index}`} class={classNames("infobox-slide", index === 0 && "is-active")} hidden={index === 0 ? undefined : true}>
            <div class="infobox-image">
              <img src={src} alt={alt} />
            </div>
            <div class={classNames("infobox-caption", !image.caption && "is-hidden")}>
              {image.caption && <Inline text={image.caption} ctx={ctx} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const galleryScript = `
function setupInfoboxGalleries() {
  var addCleanup = window.addCleanup || function () {}
  var galleries = document.querySelectorAll(".infobox-gallery")
  for (var g = 0; g < galleries.length; g++) {
    var gallery = galleries[g]
    if (gallery.dataset.infoboxReady === "true") continue
    gallery.dataset.infoboxReady = "true"
    var tabs = gallery.querySelectorAll(".infobox-image-tab")
    var slides = gallery.querySelectorAll(".infobox-slide")
    var select = function (index) {
      for (var i = 0; i < tabs.length; i++) {
        var active = i === index
        tabs[i].classList.toggle("is-active", active)
        tabs[i].setAttribute("aria-selected", active ? "true" : "false")
      }
      for (var j = 0; j < slides.length; j++) {
        var on = j === index
        slides[j].classList.toggle("is-active", on)
        if (on) slides[j].removeAttribute("hidden")
        else slides[j].setAttribute("hidden", "")
      }
    }
    for (var t = 0; t < tabs.length; t++) {
      ;(function (index, tab) {
        var onClick = function (event) {
          event.preventDefault()
          select(index)
        }
        tab.addEventListener("click", onClick)
        addCleanup(function () {
          tab.removeEventListener("click", onClick)
          delete gallery.dataset.infoboxReady
        })
      })(t, tabs[t])
    }
  }
}
document.addEventListener("nav", setupInfoboxGalleries)
document.addEventListener("render", setupInfoboxGalleries)
`

const Infobox: QuartzComponentConstructor<InfoboxOptions> = (userOpts) => {
  const options = { ...defaultOptions, ...userOpts }

  const Component: QuartzComponent = ({ fileData, allFiles, displayClass }: QuartzComponentProps) => {
    const frontmatter = (fileData.frontmatter ?? undefined) as Record<string, unknown> | undefined
    const box = readInfobox(frontmatter, options)
    if (!box) return null

    const ctx: LinkContext = {
      slug: String(fileData.slug ?? "index"),
      notes: notesFrom(allFiles),
      assets: listContentAssets(),
    }

    return (
      <div class={classNames(displayClass, "quartz-infobox")}>
        <aside class="infobox" aria-label={box.title ? `${box.title} infobox` : "Infobox"}>
          {box.supertitle && (
            <div class="infobox-supertitle">
              <Inline text={box.supertitle} ctx={ctx} />
            </div>
          )}
          {box.title && (
            <div class="infobox-title">
              <Inline text={box.title} ctx={ctx} />
            </div>
          )}
          {box.subtitle && (
            <div class="infobox-subtitle">
              <Inline text={box.subtitle} ctx={ctx} />
            </div>
          )}
          <ImageGallery box={box} ctx={ctx} />
          {box.tags.length > 0 && (
            <div class="infobox-tags">
              {box.tags.map((tag) => (
                <a key={tag} class="infobox-tag internal" href={resolveTagHref(tag, ctx.slug)} data-tag={tag}>
                  #{tag}
                </a>
              ))}
            </div>
          )}
          {box.fields.map((field, index) =>
            field.kind === "section" ? (
              <div key={`section-${index}`} class="infobox-section">
                <Inline text={field.label} ctx={ctx} />
              </div>
            ) : (
              <div key={`row-${field.label}-${index}`} class="infobox-row">
                <span class="infobox-label">
                  <Inline text={field.label} ctx={ctx} />
                </span>
                <div class="infobox-value">
                  <FieldValue value={field.value} ctx={ctx} />
                </div>
              </div>
            ),
          )}
        </aside>
      </div>
    )
  }

  Component.css = infoboxCss
  Component.afterDOMLoaded = galleryScript
  return Component
}

const infoboxCss = `
.quartz-infobox {
  --infobox-line: color-mix(in srgb, var(--dark) 18%, transparent);
  width: 100%;
  max-width: 100%;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  color: var(--darkgray);
}

@media (max-width: 1200px) {
  .quartz-infobox {
    max-width: 22rem;
  }
}

.quartz-infobox .infobox {
  background: color-mix(in srgb, var(--dark) 5%, var(--light));
  border: 1px solid var(--lightgray);
  border-radius: 10px;
  overflow: auto;
  max-height: calc(100vh - 8rem);
  scrollbar-width: thin;
}

@media (max-width: 1200px) {
  .quartz-infobox .infobox {
    max-height: 32rem;
  }
}

.quartz-infobox .infobox > :last-child {
  border-bottom: none !important;
}

.quartz-infobox .infobox-supertitle,
.quartz-infobox .infobox-subtitle,
.quartz-infobox .infobox-title {
  border-bottom: 1px solid var(--infobox-line) !important;
  text-align: center;
}

.quartz-infobox .infobox-supertitle,
.quartz-infobox .infobox-subtitle {
  padding: 0.4rem 0.75rem;
  font-style: italic;
  color: var(--gray);
  font-size: 0.92em;
}

.quartz-infobox .infobox-title {
  padding: 0.5rem 0.75rem;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--dark);
  line-height: 1.25;
}

.quartz-infobox .infobox-gallery {
  background: color-mix(in srgb, var(--dark) 4%, var(--light));
  border-bottom: 1px solid var(--infobox-line) !important;
}

.quartz-infobox .infobox-image-tabs {
  display: flex;
  width: 100%;
}

.quartz-infobox button.infobox-image-tab {
  flex: 1 1 0;
  margin: 0;
  padding: 7px 8px;
  border: none;
  border-radius: 0;
  border-right: 1px solid var(--lightgray);
  background: color-mix(in srgb, var(--dark) 9%, var(--light));
  color: var(--gray);
  font: inherit;
  font-size: 0.9em;
  font-weight: 600;
  cursor: pointer;
  box-shadow: none;
}

.quartz-infobox button.infobox-image-tab:last-child {
  border-right: none;
}

.quartz-infobox button.infobox-image-tab:hover {
  background: color-mix(in srgb, var(--dark) 5%, var(--light));
  color: var(--darkgray);
}

.quartz-infobox button.infobox-image-tab.is-active {
  background: var(--light);
  color: var(--dark);
}

.quartz-infobox .infobox-slide[hidden] {
  display: none;
}

.quartz-infobox .infobox-image {
  text-align: center;
  padding: 12px;
}

.quartz-infobox .infobox-image img,
.quartz-infobox .infobox img {
  max-width: 100%;
  height: auto;
  margin: 0 auto;
  border-radius: 6px;
  display: block;
}

.quartz-infobox .infobox-caption {
  text-align: center;
  padding: 0 16px 12px;
  font-size: 0.85em;
  font-style: italic;
  color: var(--gray);
}

.quartz-infobox .infobox-caption.is-hidden {
  display: none;
}

.quartz-infobox .infobox-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--infobox-line) !important;
}

.quartz-infobox a.infobox-tag {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 2px 7px !important;
  border-radius: 999px !important;
  background: color-mix(in srgb, var(--secondary) 16%, var(--light)) !important;
  color: var(--secondary) !important;
  font-size: 0.82em;
  font-weight: 600 !important;
  line-height: 1.4 !important;
  text-decoration: none !important;
  overflow-wrap: anywhere;
}

.quartz-infobox a.infobox-tag:hover {
  background: color-mix(in srgb, var(--secondary) 26%, var(--light)) !important;
  color: var(--secondary) !important;
  text-decoration: none !important;
}

.quartz-infobox .infobox-section {
  text-align: center;
  padding: 5px 12px;
  font-size: 0.72em;
  font-weight: 600;
  color: var(--darkgray);
  letter-spacing: 0.07em;
  text-transform: uppercase;
  background: color-mix(in srgb, var(--dark) 10%, var(--light));
  border-bottom: 1px solid var(--infobox-line) !important;
}

.quartz-infobox .infobox-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 6px 12px;
  border-bottom: 1px solid var(--infobox-line) !important;
}

.quartz-infobox .infobox-label {
  flex: 0 0 auto;
  font-weight: 600;
  color: color-mix(in srgb, var(--darkgray) 82%, var(--gray));
  font-size: 0.9em;
  white-space: nowrap;
}

.quartz-infobox .infobox-value {
  flex: 1 1 auto;
  min-width: 0;
  text-align: right;
  overflow-wrap: break-word;
  line-height: 1.35;
}

.quartz-infobox .infobox-value ul.infobox-list,
.quartz-infobox .infobox-value :is(ul, ol) {
  margin: 0 !important;
  padding-left: 1.15em;
  list-style-type: disc;
  text-align: left;
}

.quartz-infobox .infobox-value li {
  margin: 0 !important;
  padding: 0 !important;
  line-height: 1.35 !important;
}

.quartz-infobox .infobox-value :is(h1, h2, h3, h4, h5, h6) {
  font-family: inherit !important;
  font-size: 1em !important;
  line-height: 1.3 !important;
  margin: 8px 0 2px !important;
  padding-bottom: 2px;
  border-bottom: 1px solid var(--infobox-line) !important;
  text-align: left;
  font-weight: 600;
  color: var(--dark);
}

.quartz-infobox .infobox-value > :first-child {
  margin-top: 0;
}

.quartz-infobox .infobox-value p {
  margin: 0 0 6px;
  text-align: left;
}

.quartz-infobox .infobox a.internal:not(.infobox-tag),
.quartz-infobox .infobox a.external {
  background: none !important;
  padding: 0 !important;
  border-radius: 0 !important;
  font-weight: 600 !important;
  line-height: inherit !important;
  color: var(--secondary) !important;
  text-decoration: none !important;
}

.quartz-infobox .infobox a.internal:not(.infobox-tag):hover,
.quartz-infobox .infobox a.external:hover {
  color: var(--tertiary) !important;
  text-decoration: underline !important;
}

.quartz-infobox .infobox a.internal.broken {
  opacity: 0.55;
}

.quartz-infobox .infobox code {
  font-size: 0.92em;
}
`

export default Infobox
