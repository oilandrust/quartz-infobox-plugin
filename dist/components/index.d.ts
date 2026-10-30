import { QuartzComponentConstructor } from '@quartz-community/types';

interface InfoboxOptions {
    /** When `infobox.tags` is omitted, show the note's own frontmatter tags. */
    fallbackToNoteTags?: boolean;
    /** CSS `font-family` for the card. Example: `var(--bodyFont)`. */
    fontFamily?: string;
    /** CSS `font-size` for the card. Example: `12px`. */
    fontSize?: string;
    /** CSS `font-size` for the title. Example: `1rem`. */
    titleSize?: string;
    /** CSS `font-size` for section bars. Example: `0.7em`. */
    sectionSize?: string;
    /** CSS `padding` for data rows. Example: `5px 10px`. */
    rowPadding?: string;
    /** CSS `padding` for section bars. Example: `4px 10px`. */
    sectionPadding?: string;
    /** CSS background for the card shell. Example: `var(--light)`. */
    cardBackground?: string;
    /** CSS background for section bars. Example: `var(--lightgray)`. */
    sectionBackground?: string;
    /** CSS background for data rows. Example: `transparent`. */
    rowBackground?: string;
    /** CSS background for alternating data rows. */
    altRowBackground?: string;
    /** CSS color for separators between rows and sections. */
    lineColor?: string;
}
/** Build inline CSS variables from plugin options. Exported for tests. */
declare function themeStyleFromOptions(opts: InfoboxOptions): Record<string, string> | undefined;
declare const Infobox: QuartzComponentConstructor<InfoboxOptions>;

export { Infobox, type InfoboxOptions, themeStyleFromOptions };
