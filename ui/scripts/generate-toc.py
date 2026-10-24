#!/usr/bin/env python3
"""Generate ui/lib/toc-data.ts from book/00-table-of-contents.md.

Run:  python scripts/generate-toc.py   (from the ui/ directory)

The UI reads chapter *content* ONLY from book/01-traffic-management (task
requirement). This script only parses the TOC file once at development time
to produce a static data module, so the runtime never touches other folders.

Regenerate whenever 00-table-of-contents.md changes.
"""
import re
import json
import pathlib

BOOK = pathlib.Path(__file__).resolve().parents[2] / "book"
TOC = BOOK / "00-table-of-contents.md"
OUT = pathlib.Path(__file__).resolve().parents[1] / "lib" / "toc-data.ts"


def parse():
    text = TOC.read_text(encoding="utf-8")
    parts, cur = [], None
    for line in text.splitlines():
        m = re.match(r"^## Part ([IVX]+) — (.+?) \(Chapters (\d+)–(\d+)\)$", line)
        if m:
            roman, title, s, e = m.groups()
            cur = {
                "roman": roman,
                "title": title,
                "start": int(s),
                "end": int(e),
                "objective": "",
                "chapters": [],
            }
            parts.append(cur)
            continue
        m = re.match(r"^\*Learning objectives: (.+)\*$", line)
        if m and cur is not None and not cur["objective"]:
            cur["objective"] = m.group(1)
            continue
        m = re.match(r"^- \[Chapter (\d+) — (.+?)\]\((.+?\.md)\)", line)
        if m and cur is not None:
            num, ctitle, path = m.groups()
            folder, fname = path.split("/")
            cur["chapters"].append(
                {
                    "number": int(num),
                    "title": ctitle,
                    "slug": fname[:-3],
                    "folder": folder,
                }
            )
    return parts


def validate(parts):
    total = 0
    for i, p in enumerate(parts, start=1):
        nums = [c["number"] for c in p["chapters"]]
        expected = list(range(p["start"], p["end"] + 1))
        assert nums == expected, f"Part {p['roman']}: {nums} != {expected}"
        assert len(p["chapters"]) == p["end"] - p["start"] + 1
        total += len(p["chapters"])
    assert total == 111, f"expected 111 chapters, got {total}"
    assert len(parts) == 13, f"expected 13 parts, got {len(parts)}"


def emit(parts):
    def q(s):
        return json.dumps(s, ensure_ascii=False)

    lines = [
        "// AUTO-GENERATED from book/00-table-of-contents.md — do not edit by hand.",
        "// Regenerate: python scripts/generate-toc.py   (from ui/)",
        "",
        "export interface TocChapter {",
        "  number: number;",
        "  title: string;",
        "  slug: string;",
        "  folder: string;",
        "}",
        "",
        "export interface TocPart {",
        "  id: number;",
        "  roman: string;",
        "  title: string;",
        "  objective: string;",
        "  chapters: TocChapter[];",
        "}",
        "",
        "export const TOC: TocPart[] = [",
    ]
    for i, p in enumerate(parts, start=1):
        lines.append("  {")
        lines.append(f"    id: {i},")
        lines.append(f"    roman: {q(p['roman'])},")
        lines.append(f"    title: {q(p['title'])},")
        lines.append(f"    objective: {q(p['objective'])},")
        lines.append("    chapters: [")
        for c in p["chapters"]:
            lines.append(
                "      { "
                f"number: {c['number']}, title: {q(c['title'])}, "
                f"slug: {q(c['slug'])}, folder: {q(c['folder'])} "
                "},"
            )
        lines.append("    ],")
        lines.append("  },")
    lines.append("];")
    lines.append("")
    lines.append("export const ALL_CHAPTERS: TocChapter[] = TOC.flatMap((p) => p.chapters);")
    lines.append("")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return OUT


if __name__ == "__main__":
    parts = parse()
    validate(parts)
    out = emit(parts)
    print(f"OK: {len(parts)} parts, 111 chapters -> {out}")
