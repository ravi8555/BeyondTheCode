/** Client-safe slug helper shared by TOC rail and markdown headings. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/`/g, '')
    .trim()
    .replace(/[^\w\- ]/g, '')
    .replace(/ +/g, '-');
}
