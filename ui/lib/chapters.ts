import fs from 'node:fs';
import path from 'node:path';
import { slugify } from './slugify';
import { ALL_CHAPTERS, TOC, type TocChapter, type TocPart } from './toc-data';

export { slugify };

/**
 * STRICT reading boundary (task requirement): chapter *content* is only ever
 * fetched from these folders, even if other folders later contain .md files.
 * To open a new part, add its folder here and regenerate toc-data.ts.
 */
export const READABLE_FOLDERS = ['01-traffic-management'] as const;

const BOOK_DIR = (() => {
  // ui/ sits next to book/ — works for `next dev`, `build`, and `start`.
  const candidates = [
    path.join(process.cwd(), '..', 'book'),
    path.join(process.cwd(), 'book'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(`book/ directory not found (tried: ${candidates.join(', ')})`);
})();

export interface ChapterMeta {
  chapter: TocChapter;
  part: TocPart;
}

export function partFor(chapterNumber: number): TocPart | undefined {
  return TOC.find((p) =>
    p.chapters.some((c) => c.number === chapterNumber),
  );
}

export function chapterBySlug(slug: string): TocChapter | undefined {
  return ALL_CHAPTERS.find((c) => c.slug === slug);
}

function chapterPath(chapter: TocChapter): string {
  return path.join(BOOK_DIR, chapter.folder, `${chapter.slug}.md`);
}

/** True when the chapter is allowed AND its file exists on disk. */
export function isAvailable(chapter: TocChapter): boolean {
  if (!(READABLE_FOLDERS as readonly string[]).includes(chapter.folder)) {
    return false;
  }
  try {
    return fs.statSync(chapterPath(chapter)).isFile();
  } catch {
    return false;
  }
}

/** All chapters whose content may be read right now. */
export function availableChapters(): ChapterMeta[] {
  return ALL_CHAPTERS.filter(isAvailable).map((chapter) => ({
    chapter,
    part: partFor(chapter.number) as TocPart,
  }));
}

/** Read one chapter's markdown. Returns null if not readable/absent. */
export function readChapter(slug: string): (ChapterMeta & { markdown: string }) | null {
  const chapter = chapterBySlug(slug);
  if (!chapter || !isAvailable(chapter)) return null;
  try {
    const markdown = fs.readFileSync(chapterPath(chapter), 'utf-8');
    return { chapter, part: partFor(chapter.number) as TocPart, markdown };
  } catch {
    return null;
  }
}

export interface ChapterStats {
  title: string;      // from the leading `# Chapter NN — Title`
  excerpt: string;    // first body paragraph (after blockquote front matter)
  words: number;
  minutes: number;
  sections: { id: string; title: string }[];
}

/** github-slugger-compatible-enough slug for our `## N. Title` headings. */

export function chapterStats(markdown: string): ChapterStats {
  const lines = markdown.split(/\r?\n/);

  // Title: first `# ` heading.
  const h1 = lines.find((l) => l.startsWith('# '));
  const title = h1 ? h1.replace(/^#\s+/, '').trim() : '';

  // Excerpt: first paragraph that is not the blockquote front matter,
  // not a heading, not a fence, and long enough to be a real intro.
  let inFence = false;
  let excerpt = '';
  for (const line of lines) {
    if (line.trim().startsWith('```')) { inFence = !inFence; continue; }
    if (inFence) continue;
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('>') || t.startsWith('|') ||
        t.startsWith('-') || t.startsWith('*') || t.startsWith('1.')) continue;
    excerpt = t;
    break;
  }

  // Body words (rough): everything outside code fences.
  inFence = false;
  let words = 0;
  const sections: { id: string; title: string }[] = [];
  for (const line of lines) {
    if (line.trim().startsWith('```')) { inFence = !inFence; continue; }
    if (inFence) continue;
    const h2 = line.match(/^## (.+)$/);
    if (h2 && h2[1]) {
      sections.push({ id: slugify(h2[1]), title: h2[1].trim() });
      continue;
    }
    words += line.split(/\s+/).filter(Boolean).length;
  }

  return {
    title,
    excerpt: excerpt.length > 300 ? `${excerpt.slice(0, 297).trimEnd()}…` : excerpt,
    words,
    minutes: Math.max(1, Math.round(words / 200)),
    sections,
  };
}
