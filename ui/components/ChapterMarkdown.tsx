'use client';

import { useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import mermaid from 'mermaid';

// Rendering contract: only this component transforms markdown into the page DOM.
mermaid.initialize({ startOnLoad: false, theme: 'base', securityLevel: 'loose' });

function plainText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (!children) return '';
  if (Array.isArray(children)) return children.map(plainText).join('');
  return String(children);
}

export default function ChapterMarkdown({
  markdown,
  onHeading,
}: {
  markdown: string;
  onHeading?: (id: string, text: string) => void;
}) {
  const components: Record<string, React.ComponentType<any>> = {
    h2({ node, ...props }: any) {
      const id = node.data?.hProperties?.id;
      const text = plainText(props.children);
      if (onHeading && id) onHeading(id, text);
      return <h2 {...props} id={id} />;
    },
    code({ node, ...props }: any) {
      const className = node.data?.hProperties?.className?.[0] || '';
      const match = className.match(/language-(\w+)/);
      const lang = match ? match[1] : undefined;
      const value = plainText(props.children);

      // Mermaid fenced blocks render as diagrams, not syntax-highlighted code.
      if (lang === 'mermaid') {
        return <div className="mermaid-box" data-mermaid>{value}</div>;
      }

      return (
        <pre {...props}>
          <code className={lang ? `language-${lang}` : undefined}>{value}</code>
        </pre>
      );
    },
  };

  useEffect(() => {
    const boxes = document.querySelectorAll('.mermaid-box[data-mermaid]');
    boxes.forEach((box) => {
      const b = box as HTMLElement;
      if (b.dataset.rendered) return;
      b.dataset.rendered = '1';
      const text = b.textContent?.trim();
      if (!text) return;
      mermaid
        .render('m' + Math.random().toString(36).slice(2), text)
        .then(({ svg }: { svg: string }) => {
          b.innerHTML = svg;
        })
        .catch((err: any) => {
          b.innerHTML = `<div class="mermaid-err">${String(
            err?.message || err,
          )}</div>`;
        });
    });
  }, []);

  return (
    <div className="prose markdown-container">
      <ReactMarkdown
        components={components}
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
