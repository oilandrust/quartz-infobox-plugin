import { readdirSync, statSync } from 'fs';
import path from 'path';

// src/lib/assets.ts
var IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;
function unwrapImageRef(value) {
  let src = value.trim();
  const wiki = /^!?\[\[([\s\S]+)\]\]$/.exec(src);
  if (wiki?.[1]) src = wiki[1];
  const pipe = src.indexOf("|");
  if (pipe >= 0) src = src.slice(0, pipe);
  return src.trim().replace(/^\.\//, "");
}
function isRemoteAsset(value) {
  return /^(https?:)?\/\//i.test(value) || value.startsWith("data:");
}
function preferFolder(hits, noteSlug) {
  const folder = noteSlug.split("/").filter(Boolean).slice(0, -1).join("/").toLowerCase();
  if (!folder) return hits[0] ?? "";
  return hits.find((hit) => hit.toLowerCase().startsWith(`${folder}/`)) ?? hits[0] ?? "";
}
function matchAsset(requested, noteSlug, assets) {
  const clean = unwrapImageRef(requested).replace(/\\/g, "/");
  if (!clean || isRemoteAsset(clean)) return void 0;
  const lower = clean.toLowerCase();
  const exact = assets.find((asset) => asset.toLowerCase() === lower);
  if (exact) return exact;
  const bySuffix = assets.filter((asset) => asset.toLowerCase().endsWith(`/${lower}`));
  if (bySuffix.length === 1) return bySuffix[0];
  if (bySuffix.length > 1) return preferFolder(bySuffix, noteSlug);
  if (!lower.includes("/")) {
    const hits = assets.filter((asset) => asset.toLowerCase().split("/").pop() === lower);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return preferFolder(hits, noteSlug);
  }
  return void 0;
}
var assetCache = null;
function contentRoot() {
  const candidates = [path.resolve(process.cwd(), "content"), path.resolve(process.cwd(), "vault")];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isDirectory()) return candidate;
    } catch {
    }
  }
  return candidates[0] ?? path.resolve(process.cwd(), "content");
}
function listContentAssets(root = contentRoot()) {
  const now = Date.now();
  if (assetCache && assetCache.root === root && now - assetCache.at < 1500) return assetCache.files;
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (IMAGE_EXT.test(entry.name)) {
        files.push(path.relative(root, absolute).split(path.sep).join("/"));
      }
    }
  };
  walk(root);
  assetCache = { root, files, at: now };
  return files;
}

// src/lib/links.ts
function simplifySlug(target) {
  const trimmed = target.replace(/^\//, "").replace(/\/index$/, "");
  return trimmed.length > 0 ? trimmed : "index";
}
function resolveRelative(current, target) {
  const simplified = simplifySlug(target);
  const ups = current.split("/").filter((part) => part !== "").slice(0, -1).map(() => "..");
  const root = ups.length === 0 ? "." : ups.join("/");
  return `${root}/${simplified}`.replace(/\/{2,}/g, "/");
}
function slugTag(tag) {
  return tag.trim().replace(/^#+/, "").split("/").map(
    (part) => part.trim().toLowerCase().replace(/\s+/g, "-").replace(/&/g, "-and-").replace(/[^\p{L}\p{N}\/_-]+/gu, "").replace(/-+/g, "-").replace(/^-|-$/g, "")
  ).filter(Boolean).join("/");
}
function displayFromTarget(target) {
  const withoutAnchor = target.replace(/[#^].*$/, "");
  const pageName = withoutAnchor.split("/").filter(Boolean).pop();
  return (pageName || target).replace(/\.md$/i, "");
}
function noteKeys(note) {
  const slug = (note.slug ?? "").replace(/\\/g, "/");
  const filePath = (note.filePath ?? "").replace(/\\/g, "/");
  const stem = filePath.replace(/\.md$/i, "").split("/").pop() ?? "";
  const title = note.frontmatter?.title ?? "";
  const aliases = [...note.frontmatter?.aliases ?? [], ...note.aliases ?? []];
  return [slug, slug.split("/").pop() ?? "", stem, title, ...aliases].filter(Boolean);
}
function findNote(target, currentSlug, notes) {
  const needle = target.replace(/\\/g, "/").replace(/\.md$/i, "").replace(/^\//, "");
  const needleLower = needle.toLowerCase();
  const stem = needleLower.split("/").pop() ?? needleLower;
  const folder = currentSlug.split("/").filter(Boolean).slice(0, -1).join("/").toLowerCase();
  let best;
  for (const note of notes) {
    const slug = (note.slug ?? "").toLowerCase();
    const filePath = (note.filePath ?? "").replace(/\\/g, "/").toLowerCase();
    const keys = noteKeys(note).map((key) => key.toLowerCase());
    let score = 0;
    if (slug === needleLower || filePath.endsWith(`/${needleLower}.md`) || filePath.endsWith(`/${needleLower}`)) {
      score = 100;
    } else if (slug.endsWith(`/${needleLower}`)) score = 90;
    else if (keys.includes(needleLower) || keys.includes(stem)) score = 80;
    else continue;
    if (folder && slug.startsWith(`${folder}/`)) score += 5;
    if (!best || score > best.score) best = { note, score };
  }
  return best?.note;
}
function resolveWikilink(raw, currentSlug, notes) {
  let body = raw.trim();
  let alias;
  const pipe = body.indexOf("|");
  if (pipe >= 0) {
    alias = body.slice(pipe + 1).trim();
    body = body.slice(0, pipe).trim();
  }
  let hash = "";
  const anchor = body.search(/[#^]/);
  if (anchor >= 0) {
    const anchorText = body.slice(anchor);
    hash = anchorText.startsWith("#") ? anchorText : `#${anchorText}`;
    body = body.slice(0, anchor).trim();
  }
  if (/^(https?:)?\/\//i.test(body) || body.startsWith("mailto:")) {
    return { href: body, label: alias || body, external: true, broken: false };
  }
  const note = findNote(body, currentSlug, notes);
  const label = alias || displayFromTarget(body);
  if (!note?.slug) {
    const guess = body.split("/").map((part) => part.trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean).join("/");
    return {
      href: `${resolveRelative(currentSlug, guess || "missing")}${hash}`,
      label: alias || displayFromTarget(body),
      external: false,
      broken: true
    };
  }
  return {
    href: `${resolveRelative(currentSlug, note.slug)}${hash}`,
    label,
    external: false,
    broken: false
  };
}
function resolveTagHref(tag, currentSlug) {
  return resolveRelative(currentSlug, `tags/${slugTag(tag)}`);
}
function resolveAssetHref(assetPath, currentSlug) {
  return resolveRelative(currentSlug, assetPath);
}

// src/lib/text.ts
function splitOutsideLinks(str, delimiter) {
  const tokens = [];
  let current = "";
  let inWikilink = 0;
  let inBracket = 0;
  let inParen = 0;
  let inQuote = null;
  for (let i2 = 0; i2 < str.length; i2++) {
    const ch = str[i2] ?? "";
    const next = str[i2 + 1];
    if ((ch === '"' || ch === "'") && inWikilink === 0 && inBracket === 0 && inParen === 0) {
      if (inQuote === ch) inQuote = null;
      else if (inQuote === null) inQuote = ch;
      current += ch;
      continue;
    }
    if (inQuote !== null) {
      current += ch;
      continue;
    }
    if (ch === "[" && next === "[") {
      inWikilink++;
      current += "[[";
      i2++;
      continue;
    }
    if (ch === "]" && next === "]") {
      if (inWikilink > 0) inWikilink--;
      current += "]]";
      i2++;
      continue;
    }
    if (inWikilink === 0) {
      if (ch === "[") inBracket++;
      else if (ch === "]") {
        if (inBracket > 0) inBracket--;
      } else if (ch === "(" && inBracket === 0) inParen++;
      else if (ch === ")") {
        if (inParen > 0) inParen--;
      }
    }
    if (ch === delimiter && inWikilink === 0 && inBracket === 0 && inParen === 0 && inQuote === null) {
      if (current.trim().length > 0) tokens.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) tokens.push(current.trim());
  return tokens.filter(Boolean);
}
function isBulletLine(line) {
  return /^[-+•]\s+|^\*\s+|^\d+[.)]\s+/.test(line);
}
function isLinkToken(value) {
  const trimmed = value.trim();
  return /^!?\[\[.*\]\]$/.test(trimmed) || /^\[.*\]\(.*\)$/.test(trimmed);
}
function extractListItems(value) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map((item) => normalizeInlineValue(item)).filter(Boolean);
  }
  if (typeof value !== "string") return [String(value)];
  const str = value.trim();
  if (!str) return [];
  if (str.includes("\n")) {
    const rawLines = str.split("\n").map((line) => line.trim()).filter(Boolean);
    const hasBulletPrefix = rawLines.length > 1 && rawLines.every(isBulletLine);
    if (hasBulletPrefix) {
      return rawLines.map((line) => line.replace(/^[-+•]\s+|^\*\s+|^\d+[.)]\s+/, "").trim()).filter(Boolean);
    }
    return [str];
  }
  const pipeParts = splitOutsideLinks(str, "|");
  if (pipeParts.length > 1) return pipeParts;
  const commaParts = splitOutsideLinks(str, ",");
  if (commaParts.length > 1) {
    const allLinks = commaParts.every(isLinkToken);
    const isDate = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s*\d{4}\b/i.test(
      str
    ) || /\b\d{1,2},\s*\d{4}\b/.test(str);
    const isFormattedSentence = str.includes(":") || /^\*\*|^\*|^_/.test(str);
    if (allLinks || !isDate && !isFormattedSentence) return commaParts;
  }
  const semiParts = splitOutsideLinks(str, ";");
  if (semiParts.length > 1) return semiParts;
  return [str];
}
function normalizeInlineValue(value) {
  if (value == null) return "";
  if (Array.isArray(value)) {
    if (value.length === 1) {
      const inner = value[0];
      if (Array.isArray(inner) && inner.length === 1 && inner[0] != null && typeof inner[0] !== "object") {
        const text = String(inner[0]).trim();
        return text.startsWith("[[") && text.endsWith("]]") ? text : `[[${text}]]`;
      }
      if (typeof inner === "string") {
        const text = inner.trim();
        return text.startsWith("[[") && text.endsWith("]]") ? text : `[[${text}]]`;
      }
    }
    return value.map((item) => {
      if (Array.isArray(item) && item.length === 1 && item[0] != null && typeof item[0] !== "object") {
        const text = String(item[0]).trim();
        return text.startsWith("[[") && text.endsWith("]]") ? text : `[[${text}]]`;
      }
      return normalizeInlineValue(item);
    }).join(", ");
  }
  return String(value);
}
function normalizeTags(value) {
  const tags = [];
  const seen = /* @__PURE__ */ new Set();
  const addTag = (raw) => {
    if (raw == null) return;
    if (Array.isArray(raw)) {
      raw.forEach(addTag);
      return;
    }
    if (typeof raw === "object") {
      const record = raw;
      addTag(record.tag ?? record.name ?? "");
      return;
    }
    const parts = String(raw).split(/[\s,]+/).map((tag) => tag.trim().replace(/^#+/, "").replace(/,+$/, "")).filter(Boolean);
    for (const tag of parts) {
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      tags.push(tag);
    }
  };
  addTag(value);
  return tags;
}
function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}
function asText(value) {
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : void 0;
}
function readInfobox(frontmatter, options) {
  const box = asRecord(frontmatter?.infobox);
  if (!box) return null;
  const images = [];
  if (Array.isArray(box.images)) {
    for (const entry of box.images) {
      const record = asRecord(entry);
      const image = record ? asText(record.image) : void 0;
      if (!record || !image) continue;
      images.push({
        label: asText(record.label) ?? "",
        image,
        caption: asText(record.caption) ?? ""
      });
    }
  }
  if (images.length === 0 && asText(box.image)) {
    images.push({
      label: "",
      image: asText(box.image) ?? "",
      caption: asText(box.caption) ?? ""
    });
  }
  let tags = [];
  if (box.showTags !== false) {
    if (box.tags != null) tags = normalizeTags(box.tags);
    else if (options.fallbackToNoteTags && frontmatter?.tags != null) tags = normalizeTags(frontmatter.tags);
  }
  const fields = [];
  if (Array.isArray(box.fields)) {
    for (const item of box.fields) {
      const record = asRecord(item);
      if (!record) continue;
      const key = Object.keys(record)[0];
      if (!key) continue;
      const value = record[key];
      if (key.toLowerCase() === "section") {
        const label = normalizeInlineValue(value).trim();
        if (label) fields.push({ kind: "section", label });
      } else {
        fields.push({ kind: "row", label: key, value });
      }
    }
  }
  const data = {
    supertitle: asText(box.supertitle),
    title: asText(box.title),
    subtitle: asText(box.subtitle),
    images,
    tags,
    fields
  };
  const hasContent = Boolean(
    data.supertitle || data.title || data.subtitle || data.images.length || data.tags.length || data.fields.length
  );
  return hasContent ? data : null;
}
function parseRichBlocks(value) {
  if (!value.includes("\n")) return null;
  if (!/^#{1,6}\s+/m.test(value) && !/^\s*[-+*]\s+/m.test(value)) return null;
  const blocks = [];
  const lines = value.split(/\r?\n/);
  let index = 0;
  while (index < lines.length) {
    const raw = lines[index] ?? "";
    const line = raw.trim();
    if (!line) {
      index++;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1]?.length ?? 4, text: heading[2] ?? "" });
      index++;
      continue;
    }
    if (isBulletLine(line)) {
      const items = [];
      while (index < lines.length && isBulletLine((lines[index] ?? "").trim())) {
        items.push((lines[index] ?? "").trim().replace(/^[-+•]\s+|^\*\s+|^\d+[.)]\s+/, "").trim());
        index++;
      }
      blocks.push({ type: "list", items: items.filter(Boolean) });
      continue;
    }
    const paragraph = [];
    while (index < lines.length) {
      const next = (lines[index] ?? "").trim();
      if (!next || /^(#{1,6})\s+/.test(next) || isBulletLine(next)) break;
      paragraph.push(next);
      index++;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }
  return blocks.length > 0 ? blocks : null;
}
var l;
function S(n2) {
  return n2.children;
}
l = { __e: function(n2, l2, u3, t2) {
  for (var i2, r2, o2; l2 = l2.__; ) if ((i2 = l2.__c) && !i2.__) try {
    if ((r2 = i2.constructor) && null != r2.getDerivedStateFromError && (i2.setState(r2.getDerivedStateFromError(n2)), o2 = i2.__d), null != i2.componentDidCatch && (i2.componentDidCatch(n2, t2 || {}), o2 = i2.__d), o2) return i2.__E = i2;
  } catch (l3) {
    n2 = l3;
  }
  throw n2;
} }, "function" == typeof Promise ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout, Math.random().toString(8);

// node_modules/preact/jsx-runtime/dist/jsxRuntime.mjs
var f2 = 0;
function u2(e2, t2, n2, o2, i2, u3) {
  t2 || (t2 = {});
  var a2, c2, p2 = t2;
  if ("ref" in p2) for (c2 in p2 = {}, t2) "ref" == c2 ? a2 = t2[c2] : p2[c2] = t2[c2];
  var l2 = { type: e2, props: p2, key: n2, ref: a2, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: --f2, __i: -1, __u: 0, __source: i2, __self: u3 };
  if ("function" == typeof e2 && (a2 = e2.defaultProps)) for (c2 in a2) void 0 === p2[c2] && (p2[c2] = a2[c2]);
  return l.vnode && l.vnode(l2), l2;
}

// src/components/Infobox.tsx
var defaultOptions = {
  fallbackToNoteTags: true
};
var THEME_VARS = [
  ["fontFamily", "--infobox-font-family"],
  ["fontSize", "--infobox-font-size"],
  ["titleSize", "--infobox-title-size"],
  ["sectionSize", "--infobox-section-size"],
  ["rowPadding", "--infobox-row-padding"],
  ["sectionPadding", "--infobox-section-padding"],
  ["cardBackground", "--infobox-card-background"],
  ["sectionBackground", "--infobox-section-background"],
  ["rowBackground", "--infobox-row-background"],
  ["altRowBackground", "--infobox-alt-row-background"],
  ["lineColor", "--infobox-line"]
];
function themeStyleFromOptions(opts) {
  const style = {};
  for (const [optionKey, cssVar] of THEME_VARS) {
    const value = opts[optionKey];
    if (typeof value === "string" && value.trim()) style[cssVar] = value.trim();
  }
  return Object.keys(style).length > 0 ? style : void 0;
}
var INLINE = /!\[\[([\s\S]+?)\]\]|\[\[([\s\S]+?)\]\]|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\*([^*]+)\*|_([^_]+)_/g;
function classNames(...values) {
  return values.filter(Boolean).join(" ");
}
function plainText(value) {
  return value.replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, alias) => {
    if (alias?.trim()) return alias.trim();
    return target.split("/").filter(Boolean).pop() ?? target;
  }).replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}
function notesFrom(allFiles) {
  return allFiles.map((file) => {
    const frontmatter = file.frontmatter;
    const aliases = file.aliases;
    return {
      slug: file.slug ? String(file.slug) : void 0,
      filePath: file.filePath ? String(file.filePath) : void 0,
      aliases,
      frontmatter
    };
  });
}
function tokenize(text, ctx) {
  const nodes = [];
  INLINE.lastIndex = 0;
  let cursor = 0;
  let match;
  while (match = INLINE.exec(text)) {
    const index = match.index;
    if (index > cursor) nodes.push({ kind: "text", value: text.slice(cursor, index) });
    if (match[1]) {
      const src = unwrapImageRef(`![[${match[1]}]]`);
      nodes.push(imageOrLink(src, ctx));
    } else if (match[2]) {
      nodes.push(linkNode(match[2], ctx));
    } else if (match[3] && match[4]) {
      const target = match[4].trim();
      if (isRemoteAsset(target) || target.startsWith("mailto:")) {
        nodes.push({
          kind: "link",
          label: match[3],
          href: target,
          className: "external",
          external: true
        });
      } else {
        nodes.push(linkNode(`${target}|${match[3]}`, ctx));
      }
    } else if (match[5] || match[6]) {
      nodes.push({ kind: "strong", value: match[5] || match[6] || "" });
    } else if (match[7]) {
      nodes.push({ kind: "code", value: match[7] });
    } else if (match[8] || match[9]) {
      nodes.push({ kind: "em", value: match[8] || match[9] || "" });
    }
    cursor = index + match[0].length;
  }
  if (cursor < text.length) nodes.push({ kind: "text", value: text.slice(cursor) });
  return nodes;
}
function imageOrLink(raw, ctx) {
  if (isRemoteAsset(raw)) return { kind: "image", src: raw, alt: "" };
  if (/\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(raw)) {
    const asset = matchAsset(raw, ctx.slug, ctx.assets) ?? raw;
    return { kind: "image", src: resolveAssetHref(asset, ctx.slug), alt: raw };
  }
  return linkNode(raw, ctx);
}
function linkNode(raw, ctx) {
  const link = resolveWikilink(raw, ctx.slug, ctx.notes);
  return {
    kind: "link",
    label: link.label,
    href: link.href,
    className: classNames("infobox-link", link.external ? "external" : "internal", link.broken && "broken"),
    external: link.external
  };
}
function Inline({ text, ctx }) {
  const nodes = tokenize(text, ctx);
  return /* @__PURE__ */ u2(S, { children: nodes.map((node, index) => {
    if (node.kind === "text") return /* @__PURE__ */ u2("span", { children: node.value }, index);
    if (node.kind === "strong") return /* @__PURE__ */ u2("strong", { children: node.value }, index);
    if (node.kind === "em") return /* @__PURE__ */ u2("em", { children: node.value }, index);
    if (node.kind === "code") return /* @__PURE__ */ u2("code", { children: node.value }, index);
    if (node.kind === "image") return /* @__PURE__ */ u2("img", { src: node.src, alt: node.alt }, index);
    if (node.kind !== "link") return null;
    return /* @__PURE__ */ u2(
      "a",
      {
        href: node.href,
        class: node.className,
        ...node.external ? { target: "_blank", rel: "noopener noreferrer" } : {},
        children: node.label
      },
      index
    );
  }) });
}
function FieldValue({ value, ctx }) {
  const items = extractListItems(value);
  if (items.length > 1) {
    return /* @__PURE__ */ u2("ul", { class: "infobox-list", children: items.map((item, index) => /* @__PURE__ */ u2("li", { children: /* @__PURE__ */ u2(Inline, { text: item, ctx }) }, index)) });
  }
  const text = items[0] ?? "";
  const blocks = parseRichBlocks(text);
  if (!blocks) return /* @__PURE__ */ u2(Inline, { text, ctx });
  return /* @__PURE__ */ u2(S, { children: blocks.map((block, index) => /* @__PURE__ */ u2(RichBlockView, { block, ctx }, index)) });
}
function RichBlockView({ block, ctx }) {
  if (block.type === "heading") {
    const level = Math.min(Math.max(block.level ?? 4, 1), 6);
    const Tag = `h${level}`;
    return /* @__PURE__ */ u2(Tag, { children: /* @__PURE__ */ u2(Inline, { text: block.text ?? "", ctx }) });
  }
  if (block.type === "list") {
    return /* @__PURE__ */ u2("ul", { class: "infobox-list", children: (block.items ?? []).map((item, index) => /* @__PURE__ */ u2("li", { children: /* @__PURE__ */ u2(Inline, { text: item, ctx }) }, index)) });
  }
  return /* @__PURE__ */ u2("p", { children: /* @__PURE__ */ u2(Inline, { text: block.text ?? "", ctx }) });
}
function ImageGallery({ box, ctx }) {
  if (box.images.length === 0) return null;
  const multiple = box.images.length > 1;
  return /* @__PURE__ */ u2("div", { class: "infobox-gallery", children: [
    multiple && /* @__PURE__ */ u2("div", { class: "infobox-image-tabs", role: "tablist", children: box.images.map((image, index) => /* @__PURE__ */ u2(
      "button",
      {
        type: "button",
        class: classNames("infobox-image-tab", index === 0 && "is-active"),
        role: "tab",
        "aria-selected": index === 0 ? "true" : "false",
        "data-index": index,
        children: image.label || `Image ${index + 1}`
      },
      image.label || image.image
    )) }),
    box.images.map((image, index) => {
      const raw = unwrapImageRef(image.image);
      const src = isRemoteAsset(raw) ? raw : resolveAssetHref(matchAsset(raw, ctx.slug, ctx.assets) ?? raw, ctx.slug);
      const alt = plainText(image.caption || image.label || box.title || "");
      return /* @__PURE__ */ u2("div", { class: classNames("infobox-slide", index === 0 && "is-active"), hidden: index === 0 ? void 0 : true, children: [
        /* @__PURE__ */ u2("div", { class: "infobox-image", children: /* @__PURE__ */ u2("img", { src, alt }) }),
        /* @__PURE__ */ u2("div", { class: classNames("infobox-caption", !image.caption && "is-hidden"), children: image.caption && /* @__PURE__ */ u2(Inline, { text: image.caption, ctx }) })
      ] }, `${image.image}-${index}`);
    })
  ] });
}
var galleryScript = `
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
`;
var Infobox = (userOpts) => {
  const options = { ...defaultOptions, ...userOpts };
  const Component = ({ fileData, allFiles, displayClass }) => {
    const frontmatter = fileData.frontmatter ?? void 0;
    const box = readInfobox(frontmatter, options);
    if (!box) return null;
    const ctx = {
      slug: String(fileData.slug ?? "index"),
      notes: notesFrom(allFiles),
      assets: listContentAssets()
    };
    let rowIndex = 0;
    const themeStyle = themeStyleFromOptions(options);
    return /* @__PURE__ */ u2("div", { class: classNames(displayClass, "quartz-infobox"), style: themeStyle, children: /* @__PURE__ */ u2("aside", { class: "infobox", "aria-label": box.title ? `${box.title} infobox` : "Infobox", children: [
      box.supertitle && /* @__PURE__ */ u2("div", { class: "infobox-supertitle", children: /* @__PURE__ */ u2(Inline, { text: box.supertitle, ctx }) }),
      box.title && /* @__PURE__ */ u2("div", { class: "infobox-title", children: /* @__PURE__ */ u2(Inline, { text: box.title, ctx }) }),
      box.subtitle && /* @__PURE__ */ u2("div", { class: "infobox-subtitle", children: /* @__PURE__ */ u2(Inline, { text: box.subtitle, ctx }) }),
      /* @__PURE__ */ u2(ImageGallery, { box, ctx }),
      box.tags.length > 0 && /* @__PURE__ */ u2("div", { class: "infobox-tags", children: box.tags.map((tag) => /* @__PURE__ */ u2("a", { class: "infobox-tag internal", href: resolveTagHref(tag, ctx.slug), "data-tag": tag, children: [
        "#",
        tag
      ] }, tag)) }),
      box.fields.map((field, index) => {
        if (field.kind === "section") {
          return /* @__PURE__ */ u2("div", { class: "infobox-section", children: /* @__PURE__ */ u2(Inline, { text: field.label, ctx }) }, `section-${index}`);
        }
        const isAlt = rowIndex % 2 === 1;
        rowIndex += 1;
        return /* @__PURE__ */ u2(
          "div",
          {
            class: classNames("infobox-row", isAlt && "is-alt"),
            children: [
              /* @__PURE__ */ u2("span", { class: "infobox-label", children: /* @__PURE__ */ u2(Inline, { text: field.label, ctx }) }),
              /* @__PURE__ */ u2("div", { class: "infobox-value", children: /* @__PURE__ */ u2(FieldValue, { value: field.value, ctx }) })
            ]
          },
          `row-${field.label}-${index}`
        );
      })
    ] }) });
  };
  Component.css = infoboxCss;
  Component.afterDOMLoaded = galleryScript;
  return Component;
};
var infoboxCss = `
.quartz-infobox {
  --infobox-line: color-mix(in srgb, var(--dark) 18%, transparent);
  width: 100%;
  max-width: 100%;
  font-family: var(--infobox-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif);
  font-size: var(--infobox-font-size, 13px);
  line-height: 1.4;
  color: var(--darkgray);
}

@media (max-width: 1200px) {
  .quartz-infobox {
    max-width: 22rem;
  }
}

.quartz-infobox .infobox {
  background: var(--infobox-card-background, color-mix(in srgb, var(--dark) 5%, var(--light)));
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
  font-size: var(--infobox-title-size, 1.15rem);
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
  padding: var(--infobox-section-padding, 5px 12px);
  font-size: var(--infobox-section-size, 0.72em);
  font-weight: 600;
  color: var(--darkgray);
  letter-spacing: 0.07em;
  text-transform: uppercase;
  background: var(--infobox-section-background, color-mix(in srgb, var(--dark) 10%, var(--light)));
  border-bottom: 1px solid var(--infobox-line) !important;
}

.quartz-infobox .infobox-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: var(--infobox-row-padding, 6px 12px);
  background: var(--infobox-row-background, transparent);
  border-bottom: 1px solid var(--infobox-line) !important;
}

.quartz-infobox .infobox-row.is-alt {
  background: var(--infobox-alt-row-background, var(--infobox-row-background, transparent));
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
`;
var Infobox_default = Infobox;

export { Infobox_default as Infobox, themeStyleFromOptions };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map