import { describe, expect, it } from "vitest"
import { themeStyleFromOptions } from "../src/components/Infobox"
import { matchAsset } from "../src/lib/assets"
import { resolveRelative, resolveWikilink } from "../src/lib/links"
import { extractListItems, normalizeTags, readInfobox } from "../src/lib/text"

describe("extractListItems", () => {
  it("keeps dates intact", () => {
    expect(extractListItems("March 14, 1879")).toEqual(["March 14, 1879"])
    expect(extractListItems("April 18, 1955")).toEqual(["April 18, 1955"])
  })

  it("splits pipes and commas outside wikilinks", () => {
    expect(extractListItems("General relativity | Special relativity")).toEqual([
      "General relativity",
      "Special relativity",
    ])
    expect(extractListItems("[[Germany|German]] | [[United States|American]]")).toEqual([
      "[[Germany|German]]",
      "[[United States|American]]",
    ])
    expect(extractListItems("Knight, Mage, Archer")).toEqual(["Knight", "Mage", "Archer"])
    expect(extractListItems("[[Knights of Favonius]], [[Adventurers' Guild]]")).toEqual([
      "[[Knights of Favonius]]",
      "[[Adventurers' Guild]]",
    ])
  })

  it("splits bullet lines and leaves headed block scalars whole", () => {
    expect(extractListItems("- Black King\n- Iron God")).toEqual(["Black King", "Iron God"])
    const block = "#### Codenames\n- Black King\n- Iron God"
    expect(extractListItems(block)).toEqual([block])
  })

  it("reads yaml arrays", () => {
    expect(extractListItems(["Alpha", "Beta"])).toEqual(["Alpha", "Beta"])
  })
})

describe("tags and infobox", () => {
  it("normalizes and dedupes tags", () => {
    expect(normalizeTags(["#Science", "science", "physics, history"])).toEqual([
      "Science",
      "physics",
      "history",
    ])
  })

  it("hides tags and falls back to the note", () => {
    const hidden = readInfobox(
      { tags: ["secret"], infobox: { title: "Hidden", showTags: false } },
      { fallbackToNoteTags: true },
    )
    expect(hidden?.tags).toEqual([])

    const fallback = readInfobox(
      { tags: ["anemo"], infobox: { title: "Mondstadt" } },
      { fallbackToNoteTags: true },
    )
    expect(fallback?.tags).toEqual(["anemo"])
  })

  it("returns null when there is no infobox object", () => {
    expect(readInfobox({ title: "Plain", tags: ["a"] }, { fallbackToNoteTags: true })).toBeNull()
  })

  it("keeps section headers and single-image captions", () => {
    const box = readInfobox(
      {
        infobox: {
          image: "portrait.svg",
          caption: "A portrait",
          fields: [{ section: "Personal" }, { Born: "March 14, 1879" }],
        },
      },
      { fallbackToNoteTags: true },
    )
    expect(box?.images).toEqual([{ label: "", image: "portrait.svg", caption: "A portrait" }])
    expect(box?.fields).toEqual([
      { kind: "section", label: "Personal" },
      { kind: "row", label: "Born", value: "March 14, 1879" },
    ])
  })
})

describe("theme options", () => {
  it("maps set options to CSS variables and skips blanks", () => {
    expect(themeStyleFromOptions({})).toBeUndefined()
    expect(
      themeStyleFromOptions({
        fontFamily: "var(--bodyFont)",
        fontSize: "12px",
        titleSize: "1rem",
        sectionSize: "0.7em",
        rowPadding: "5px 10px",
        sectionPadding: "4px 10px",
        cardBackground: "var(--light)",
        sectionBackground: "var(--lightgray)",
        rowBackground: "transparent",
        altRowBackground: "color-mix(in srgb, var(--dark) 4%, var(--light))",
        lineColor: "var(--lightgray)",
        fallbackToNoteTags: true,
      }),
    ).toEqual({
      "--infobox-font-family": "var(--bodyFont)",
      "--infobox-font-size": "12px",
      "--infobox-title-size": "1rem",
      "--infobox-section-size": "0.7em",
      "--infobox-row-padding": "5px 10px",
      "--infobox-section-padding": "4px 10px",
      "--infobox-card-background": "var(--light)",
      "--infobox-section-background": "var(--lightgray)",
      "--infobox-row-background": "transparent",
      "--infobox-alt-row-background": "color-mix(in srgb, var(--dark) 4%, var(--light))",
      "--infobox-line": "var(--lightgray)",
    })
    expect(themeStyleFromOptions({ fontSize: "  " })).toBeUndefined()
  })
})

describe("links and assets", () => {
  it("resolves a page relative to the current slug", () => {
    expect(resolveRelative("people/albert-einstein", "places/germany")).toBe("../places/germany")
    expect(resolveRelative("index", "people/albert-einstein")).toBe("./people/albert-einstein")
  })

  it("resolves wikilink aliases against note titles", () => {
    const link = resolveWikilink("Germany|German", "people/albert-einstein", [
      { slug: "places/germany", frontmatter: { title: "Germany" } },
    ])
    expect(link).toMatchObject({
      href: "../places/germany",
      label: "German",
      broken: false,
    })
  })

  it("finds an image by filename anywhere in the vault", () => {
    expect(matchAsset("[[einstein.svg]]", "people/albert-einstein", ["assets/einstein.svg"])).toBe(
      "assets/einstein.svg",
    )
    expect(matchAsset("https://example.com/a.jpg", "index", [])).toBeUndefined()
  })
})
