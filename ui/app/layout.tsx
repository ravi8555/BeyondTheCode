import type { Metadata } from 'next';
import { Sidebar } from '@/components/Sidebar';
import { availableChapters } from '@/lib/chapters';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Beyond the Code — Engineering Book Reader',
    template: '%s · Beyond the Code',
  },
  description:
    'Reader UI for the Beyond the Code engineering book. Currently serving Part I — Traffic Management and Deployment.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const availableSlugs = availableChapters().map((m) => m.chapter.slug);

  return (
    <html lang="en">
      <body>
        <div className="shell">
          <Sidebar availableSlugs={availableSlugs} />
          <div className="content">{children}</div>
        </div>
      </body>
    </html>
  );
}
