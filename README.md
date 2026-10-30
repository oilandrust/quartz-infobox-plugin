# Quartz Infobox

A [Quartz 5](https://quartz.jzhao.xyz/) component that renders a Wikipedia-style infobox from note frontmatter. The frontmatter schema matches [Omni Infobox](https://github.com/omni-gh549/obsidian-infobox), so the same notes work in Obsidian and on a Quartz site.

The card sits at the top of Quartz's right sidebar. Colors use Quartz theme tokens, so the card follows light and dark mode. Font sizes, padding, and cell fills can also be set from `quartz.config.yaml` without custom CSS.

![Infobox on a Quartz page](docs/infobox.png)

## Frontmatter

```yaml
---
title: Albert Einstein
tags:
  - science
infobox:
  supertitle: Historical Figure
  title: Albert Einstein
  subtitle: Theoretical Physicist
  images:
    - label: Portrait
      image: einstein-portrait.svg
      caption: Photograph from [[1921]]
    - label: Lecture
      image: einstein-lecture.svg
      caption: Einstein giving a lecture
  tags: [science, physics]
  showTags: true
  fields:
    - section: Personal
    - Born: March 14, 1879
    - Nationality: "[[Germany|German]] / [[United States|American]]"
    - section: Career
    - Known for: "[[General Relativity]] | [[Special Relativity]]"
---
```

Notes without an `infobox` object do not get a card. `showTags: false` hides tags. If `tags` is omitted, the note's own frontmatter tags are used.

Field values follow the Obsidian plugin:

- a `section` key becomes a divider
- YAML arrays, bullet lines, pipes (`|`), semicolons, and commas render as lists
- commas inside dates such as `March 14, 1879` stay as one line
- pipes and commas inside `[[wikilinks]]` are left alone
- a YAML block scalar can contain Markdown headings and bullets

Images can be a vault-relative path, a filename anywhere in the content folder, a wikilink, or an `http` URL. `image` plus `caption` is the single-image form of `images`.

## Install

From a Quartz 5 site:

```bash
npx quartz plugin add github:oilandrust/quartz-infobox-plugin
```

The plugin registers itself in the right sidebar. To place it by hand:

```yaml
plugins:
  - source: github:oilandrust/quartz-infobox-plugin
    enabled: true
    options:
      fallbackToNoteTags: true
    layout:
      position: right
      priority: 5
```

A lower priority renders higher in the sidebar. `fallbackToNoteTags` uses the note's own tags when the infobox does not list any.

## Theming

### Quartz colors

By default the card reads Quartz CSS variables from `theme.colors` in `quartz.config.yaml` (`--light`, `--dark`, `--gray`, `--darkgray`, `--lightgray`, `--secondary`, `--tertiary`). Changing those values, or installing a theme plugin that rewrites them, updates the infobox in light and dark mode.

| Part of the card | Default source |
| --- | --- |
| Card background | mix of `--dark` into `--light` |
| Section bars | stronger mix of `--dark` into `--light` |
| Body / labels / captions | `--darkgray` / `--gray` / `--dark` |
| Links and tag pills | `--secondary` (hover `--tertiary`) |
| Separators | `--dark` at low opacity |

Data rows have no fill unless you set one. Links may look purple on sites that load `@quartz-themes/core`, because that package can override `--secondary`.

### Plugin options

Font family, sizes, padding, and fills that are not part of Quartz's global theme can be set under the plugin's `options`. Values are any CSS the browser accepts, including Quartz tokens like `var(--bodyFont)` or `var(--light)`.

```yaml
plugins:
  - source: github:oilandrust/quartz-infobox-plugin
    enabled: true
    options:
      fallbackToNoteTags: true
      fontFamily: var(--bodyFont)
      fontSize: 12px
      titleSize: 1rem
      sectionSize: 0.7em
      rowPadding: 5px 10px
      sectionPadding: 4px 10px
      cardBackground: var(--light)
      sectionBackground: var(--lightgray)
      rowBackground: transparent
      altRowBackground: color-mix(in srgb, var(--dark) 4%, var(--light))
      lineColor: var(--lightgray)
    layout:
      position: right
      priority: 5
```

| Option | CSS variable | Default |
| --- | --- | --- |
| `fontFamily` | `--infobox-font-family` | system UI stack |
| `fontSize` | `--infobox-font-size` | `13px` |
| `titleSize` | `--infobox-title-size` | `1.15rem` |
| `sectionSize` | `--infobox-section-size` | `0.72em` |
| `rowPadding` | `--infobox-row-padding` | `6px 12px` |
| `sectionPadding` | `--infobox-section-padding` | `5px 12px` |
| `cardBackground` | `--infobox-card-background` | tinted `--light` |
| `sectionBackground` | `--infobox-section-background` | stronger tinted `--light` |
| `rowBackground` | `--infobox-row-background` | `transparent` |
| `altRowBackground` | `--infobox-alt-row-background` | same as `rowBackground` |
| `lineColor` | `--infobox-line` | `--dark` at 18% opacity |

Omit an option to keep the default. Alternating row fills only apply when `altRowBackground` is set; even and odd are counted across data rows, not section headers.

### Custom CSS

For one-off tweaks, override selectors in `quartz/styles/custom.scss`. That file sits outside Quartz's base CSS layer, so it normally wins. A few infobox rules use `!important` (borders, tags, links, value headings); match that if needed.

```scss
.quartz-infobox {
  font-family: var(--bodyFont);
}
```

## Develop

```bash
npm install
npm test
npm run build
```

Commit `dist/` after a build. Quartz installs that prebuilt output and skips a local compile.
