'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TOC, type TocPart } from '@/lib/toc-data';

/**
 * Left rail: all 13 parts / 111 chapters from the generated TOC.
 * Availability comes from the server via data-attributes rendered by the
 * server layout (readable folder = 01-traffic-management only), so this
 * client component never touches the filesystem.
 */
export function Sidebar({ availableSlugs }: { availableSlugs: string[] }) {
  const pathname = usePathname();
  const available = new Set(availableSlugs);
  const [collapsed, setCollapsed] = useState(true);
  const [openParts, setOpenParts] = useState<Set<number>>(() => {
    // Auto-open the part containing the current chapter (or Part I on home).
    const m = pathname?.match(/^\/chapter\/(\d+)-/);
    const n = m ? Number(m[1]) : 1;
    const part = TOC.find((p) =>
      p.chapters.some((c) => c.number === n),
    );
    return new Set([part ? part.id : 1]);
  });

  const togglePart = (id: number) => {
    setOpenParts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const activeSlug = pathname?.startsWith('/chapter/')
    ? pathname.slice('/chapter/'.length)
    : null;

  return (
    <nav
      className={`rail${collapsed ? ' collapsed' : ''}`}
      aria-label="Book navigation"
    >
      <div className="rail-header">
        <Link href="/" className="rail-logo">
          Beyond<span className="dim">The</span>Code
        </Link>
        <div className="rail-subtitle">
          111 chapters · 13 parts · Part I live
        </div>
        <button
          className="menu-btn"
          style={{ marginTop: 10 }}
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
        >
          {collapsed ? 'Show contents ▾' : 'Hide contents ▴'}
        </button>
      </div>

      <div className="rail-nav">
        {TOC.map((part) => (
          <PartGroup
            key={part.id}
            part={part}
            available={available}
            activeSlug={activeSlug}
            open={openParts.has(part.id)}
            onToggle={() => togglePart(part.id)}
          />
        ))}
      </div>
    </nav>
  );
}

function PartGroup({
  part,
  available,
  activeSlug,
  open,
  onToggle,
}: {
  part: TocPart;
  available: Set<string>;
  activeSlug: string | null;
  open: boolean;
  onToggle: () => void;
}) {
  const liveCount = part.chapters.filter((c) => available.has(c.slug)).length;

  return (
    <div className="rail-part">
      <button
        className="rail-part-head"
        onClick={onToggle}
        aria-expanded={open}
        title={part.objective}
      >
        <span className="rail-part-num">P{part.id}</span>
        <span className="rail-part-title">{part.title}</span>
        <span className={`rail-part-count${liveCount ? ' live' : ''}`}>
          {liveCount ? `${liveCount}/${part.chapters.length}` : part.chapters.length}
        </span>
      </button>

      {open && (
        <ul className="rail-chapters">
          {part.chapters.map((ch) => {
            const isAvail = available.has(ch.slug);
            const isActive = ch.slug === activeSlug;
            const cls = `rail-chapter${isAvail ? ' available' : ' unavailable'}${
              isActive ? ' active' : ''
            }`;
            const inner = (
              <>
                <span className="num">
                  {String(ch.number).padStart(2, '0')}
                </span>
                <span className="ttl">{ch.title}</span>
              </>
            );
            return (
              <li key={ch.slug}>
                {isAvail ? (
                  <Link href={`/chapter/${ch.slug}`} className={cls}>
                    {inner}
                  </Link>
                ) : (
                  <span className={cls} title="Not written yet">
                    {inner}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
