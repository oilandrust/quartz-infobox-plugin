import { QuartzComponentConstructor } from '@quartz-community/types';

interface InfoboxOptions {
    /** When `infobox.tags` is omitted, show the note's own frontmatter tags. */
    fallbackToNoteTags?: boolean;
}
declare const Infobox: QuartzComponentConstructor<InfoboxOptions>;

export { Infobox, type InfoboxOptions };
