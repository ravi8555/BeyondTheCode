# Beyond the Code

### Complete Guide to Backend Engineering, System Design & Production-Ready Applications

> A 111-chapter learning book that teaches how backend concepts work internally, why they exist, how to implement them with Node.js and TypeScript, how they fail in production, and how to explain them in technical interviews.

## Book Status

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Outline, table of contents, prerequisite map, architecture overview, chapter template, standards, progress tracker | ✅ Complete |
| Phase 2 | Running application code and local development environment | 🔄 Started (see `code/`) |
| Phase 3 | Chapter writing (111 chapters, in order) | 🔄 Chapter 1 complete |
| Phase 4 | Cross-chapter references audit, exercise solutions pass, consolidated interview index | ⬜ Not started |
| Phase 5 | Audit all 111 topics against the required topic list | ⬜ Not started |
| Phase 6 | Validate code, links, diagrams, numbering, consistency | ⬜ Not started |

Per-chapter status lives in [`00-progress-tracker.md`](00-progress-tracker.md).

## Repository Layout

```
book/
├── README.md                        ← you are here
├── 00-preface.md                    ← preface, audience, setup, study guide
├── 00-table-of-contents.md          ← complete TOC, all 111 chapters
├── 00-prerequisite-map.md           ← what to read before what, study tracks
├── 00-architecture-overview.md      ← the running example app ("FormForge")
├── 00-chapter-template.md           ← the reusable chapter skeleton
├── 00-standards.md                  ← code, writing, and honesty standards
├── 00-progress-tracker.md           ← status of all 111 chapters
├── 01-traffic-management/           ← Part I (chapters 01–14)
├── 02-asynchronous-systems/         ← Part II (chapters 15–24)
├── 03-database-engineering/         ← Part III (chapters 25–32)
├── 04-distributed-systems/          ← Part IV (chapters 33–44)
├── 05-scaling-and-caching/          ← Part V (chapters 45–50)
├── 06-deployment-strategies/        ← Part VI (chapters 51–57)
├── 07-observability/                ← Part VII (chapters 58–66)
├── 08-security/                     ← Part VIII (chapters 67–80)
├── 09-data-management-and-recovery/ ← Part IX (chapters 81–88)
├── 10-cloud-and-performance/        ← Part X (chapters 89–96)
├── 11-networking-and-apis/          ← Part XI (chapters 97–103)
├── 12-infrastructure-and-delivery/  ← Part XII (chapters 104–108)
├── 13-production-operations/        ← Part XIII (chapters 109–111)
├── code/                            ← runnable examples referenced by chapters
├── diagrams/                        ← exported diagram sources
├── glossary.md                      ← Phase 4
├── interview-question-index.md      ← Phase 4
└── references.md                    ← consolidated references, Phase 4
```

## How to Read

1. Start with [`00-preface.md`](00-preface.md) for environment setup and conventions.
2. Check [`00-prerequisite-map.md`](00-prerequisite-map.md) before jumping around — some chapters assume earlier ones.
3. Skim [`00-architecture-overview.md`](00-architecture-overview.md) once; every chapter builds on the running **FormForge** example.
4. Read chapters in part order when possible. Each chapter is self-contained but cross-links its prerequisites.

## Conventions Used in This Book

- **Language/runtime:** TypeScript on Node.js 22 LTS as the primary implementation language.
- **Diagrams:** Mermaid (renders on GitHub, VS Code, Obsidian).
- **Cross-references:** `→ Chapter NN (Topic Name)` pointing at a full chapter file.
- **Honesty rule:** code and benchmarks are only claimed as *executed* when they actually were. Anything untested is labeled accordingly. Hypothetical measurements are always marked *hypothetical*.
- **Security rule:** every example uses secure defaults; no real credentials ever appear in this repository.
