import Link from 'next/link';
import { readChapter, chapterStats, availableChapters } from '@/lib/chapters';
import { ChapterTitle, ChapterMeta } from '@/components/ChapterHeader';
import ChapterMarkdown from '@/components/ChapterMarkdown';

export const dynamic = 'force-dynamic';

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const chapterMeta = readChapter(slug);

  if (!chapterMeta) {
    return (
      <main className="home page-dark">
        <div className="hero">
          <div className="eyebrow">Beyond the Code · Book Reader</div>
          <h1>Not available</h1>
          <p className="lede">
            Chapter content is not readable from this view.
          </p>
        </div>
        <div className="reading-nav">
          <Link href="/">← Back to chapters</Link>
        </div>
      </main>
    );
  }

  const { chapter, part, markdown } = chapterMeta;
  const stats = chapterStats(markdown);
  const all = availableChapters();
  const idx = all.findIndex((m) => m.chapter.slug === slug);
  const prev = idx > 0 ? all[idx - 1] : null;
  const next = idx < all.length - 1 ? all[idx + 1] : null;

  return (
    <div className="chapter-page page-dark">
      <aside className="toc-rail">
        <div className="toc-title">On this page</div>
        <ol>
          {stats.sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`}>{s.title}</a>
            </li>
          ))}
        </ol>
      </aside>

      <div className="article-body page-dark">
        <ChapterTitle chapter={chapter} part={part} />
        <ChapterMeta
          stats={{
            minutes: stats.minutes,
            words: stats.words,
            sections: stats.sections,
          }}
        />
        <ChapterMarkdown markdown={markdown} />

        <div className="prevnext">
          {prev ? (
            <a href={`/chapter/${prev.chapter.slug}`} className="pn-card">
              <div className="pn-dir">
                <span>Previous</span>
                <span className="g">←</span>
              </div>
              <div className="pn-title">
                Chapter {prev.chapter.number}: {prev.chapter.title}
              </div>
            </a>
          ) : (
            <div className="pn-card empty">
              <div className="pn-dir">
                <span>Previous</span>
                <span className="g">←</span>
              </div>
            </div>
          )}
          {next ? (
            <a href={`/chapter/${next.chapter.slug}`} className="pn-card next">
              <div className="pn-dir">
                <span className="g">→</span>
                <span>Next</span>
              </div>
              <div className="pn-title">
                Chapter {next.chapter.number}: {next.chapter.title}
              </div>
            </a>
          ) : (
            <div className="pn-card empty next">
              <div className="pn-dir">
                <span className="g">→</span>
                <span>Next</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
