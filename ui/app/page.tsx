import Link from 'next/link';
import { availableChapters, readChapter, chapterStats } from '@/lib/chapters';
import { TOC, ALL_CHAPTERS } from '@/lib/toc-data';

const PART_OBJECTIVE =
  'Protect services from overload, route and shape traffic, deliver code safely, and make unreliable networks usable.';

export default async function Home() {
  const available = availableChapters();
  const partI = available.filter((m) => m.part.id === 1);

  // Enrich chapters with real stats from markdown content
  const chaptersWithStats = await Promise.all(
    partI.map(async ({ chapter }) => {
      const meta = readChapter(chapter.slug);
      const stats = meta ? chapterStats(meta.markdown) : null;
      return { chapter, stats };
    })
  );

  return (
    <main className="home">
      <div className="hero">
        <div className="eyebrow">Beyond the Code · Book Reader</div>
        <h1>Traffic Management — Beyond the Code</h1>
        <p className="lede">{PART_OBJECTIVE}</p>
        <div className="chapter-meta">
          <span className="badge">{partI.length} chapters readable</span>
          <span className="sep">·</span>
          <span>{available.length} / {ALL_CHAPTERS.length} chapters</span>
        </div>
      </div>

      <section>
        <h2 className="section-title">Part I — Traffic Management and Deployment</h2>
        <div className="chapter-cards">
          {chaptersWithStats.map(({ chapter, stats }) => {
            const isNew = chapter.number >= 10;
            return (
              <Link
                key={chapter.slug}
                href={`/chapter/${chapter.slug}`}
                className={`chapter-card${isNew ? ' new' : ''}`}
                aria-label={`Read ${chapter.title} — Chapter ${chapter.number}`}
              >
                <div className="card-header">
                  <div className="card-num">Chapter {chapter.number}</div>
                  {isNew && <span className="card-badge">NEW</span>}
                </div>
                <h3>{chapter.title}</h3>
                <p className="card-excerpt">
                  {stats?.excerpt || `Read Chapter ${chapter.number} — ${chapter.title}`}
                </p>
                <div className="card-stats">
                  <span className="stat">{stats?.sections?.length || 0} sections</span>
                  <span className="sep">·</span>
                  <span className="stat">{stats?.minutes || 0} min read</span>
                  <span className="sep">·</span>
                  <span className="stat">
                    {stats?.words?.toLocaleString() || 0} words
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="section-title">All parts</h2>
        <div className="part-grid">
          {TOC.map((part) => {
            const live = available.filter((m) => m.part.id === part.id).length;
            const first = available.find((m) => m.part.id === part.id);
            const isLive = live > 0;
            return (
              <a
                key={part.id}
                href={isLive ? `/chapter/${first!.chapter.slug}` : '#'}
                className={`part-tile${isLive ? '' : ' disabled'}`}
                aria-disabled={!isLive}
              >
                <div className="pt-num">Part {part.roman}</div>
                <h4>{part.title}</h4>
                <div className="pt-count">
                  {live} / {part.chapters.length}
                  {' · '}
                  <span className={isLive ? 'pt-live' : ''}>
                    {isLive ? 'live' : 'coming soon'}
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      </section>
    </main>
  );
}
