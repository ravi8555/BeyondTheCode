import Link from 'next/link';
import { availableChapters, partFor } from '@/lib/chapters';
import { TOC, ALL_CHAPTERS } from '@/lib/toc-data';

const PART_OBJECTIVE =
  'Protect services from overload, route and shape traffic, deliver code safely, and make unreliable networks usable.';

export default function Home() {
  const available = availableChapters();
  const partI = available.filter((m) => m.part.id === 1);

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
          {partI.map(({ chapter, part }) => (
            <Link
              key={chapter.slug}
              href={`/chapter/${chapter.slug}`}
              className="chapter-card"
              aria-label={`Read ${chapter.title} — Chapter ${chapter.number}`}
            >
              <div className="card-num">Chapter {chapter.number}</div>
              <h3>{chapter.title}</h3>
              <p>Read Chapter {chapter.number} — {chapter.title}</p>
              <div className="card-meta">
                Part {part.roman} · Traffic Management
              </div>
            </Link>
          ))}
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
