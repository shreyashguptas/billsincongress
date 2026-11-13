/**
 * The arrow at the end of a text link ("Browse bills →", "Ask about this →").
 * It is a picture of "this goes somewhere", not a word, so a screen reader
 * skips it: the link reads "Browse bills", not "Browse bills right arrow"
 * (documentation/brand.md, "Input, not width"). The text is still in the DOM,
 * with the space before it, so the page reads the same to a sighted reader and
 * to autocapture. Keep it out of a flex link: flex drops the space before it.
 */
export function Arrow() {
  return <span aria-hidden="true">→</span>;
}
