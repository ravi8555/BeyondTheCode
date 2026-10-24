import Link from 'next/link';
import { TocChapter, TocPart } from '@/lib/toc-data';

export function ChapterTitle({
  chapter,
  part,
}: {
  chapter: TocChapter;
  part: TocPart;
}) {
  return (
    <div className="chapter-title-wrap">
      <div className="breadcrumbs">
        <Link href="/">Beyond the Code</Link>
        <span className="sep">/</span>
        {part.title && (
          <>
            Part {part.roman} · {part.title} <span className="sep">/</span>
          </>
        )}
        <span className="chapter-current">Chapter {chapter.number}</span>
      </div>
      <div className="chapter-number-bar">Chapter {chapter.number}</div>
      <h1>{chapter.title}</h1>
    </div>
  );
}

export function ChapterMeta({
  stats,
}: {
  stats: {
    minutes?: number;
    words?: number;
    sections?: { id: string; title: string }[];
  };
}) {
  return (
    <div className="chapter-meta-bar">
      <span>{stats?.minutes} min read</span>
      <span className="sep">·</span>
      <span>{stats?.words} words</span>
      {stats?.sections && stats.sections.length > 0 && (
        <>
          <span className="sep">·</span>
          <button className="toc-button" aria-label="On this page">
            On this page
          </button>
        </>
      )}
    </div>
  );
}
