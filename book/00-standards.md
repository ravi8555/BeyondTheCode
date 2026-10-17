# Implementation and Documentation Standards

These standards keep the 111 chapters internally consistent and trustworthy. They bind the author and give the reader a contract about what they can rely on.

## 1. Version Assumptions

Assumed when writing (verify before running — vendor APIs change):

| Tool | Assumed version | Notes |
|---|---|---|
| Node.js | 22 LTS | Examples also valid on 20+; `node:` prefixed imports used throughout |
| TypeScript | 5.x | `strict: true` in all tsconfig files |
| Express | 4.x | Middleware model is stable across 4/5 |
| PostgreSQL | 16 | SQL shown works on 13+ unless noted |
| Redis | 7.x | Lua scripting (`EVALSHA`) used for atomic limiter logic |
| Docker / Compose | Compose v2 syntax | `docker compose`, not legacy `docker-compose` |
| Nginx | 1.24+ | |
| Kubernetes | 1.29+ manifests | API versions noted per resource |
| Vitest | 2.x | Test runner for all TS examples |
| ioredis | 5.x | |
| BullMQ | 5.x | |
| k6 | current | load tests only |
| Terraform | 1.x | |
| Helm | 3.x | |

If a chapter needs a different version or a breaking-change note, it appears in that chapter's technology-stack block.

## 2. Code Standards

- **Language:** TypeScript with `strict` mode. JavaScript shown only when the JS API differs meaningfully.
- **Completeness:** every runnable example includes error handling and resource cleanup (`finally`-style, graceful shutdown handlers). No `TODO`s in shipped example paths.
- **Dependencies:** minimal; each dependency is justified in the chapter text. No utility libraries where `node:` built-ins suffice.
- **Secrets:** placeholders only (`REDIS_URL=redis://localhost:6379`, `JWT_SECRET=your-256-bit-secret-here`). No real credentials, ever.
- **Configuration:** environment variables read once at startup through a typed config module; fail fast on invalid config.
- **Runnability labels:** every code block is one of:
  - **Runnable** — exists in `book/code/NN-topic/`, tested or testable locally.
  - **Illustrative** — complete enough to understand the mechanism; omissions listed right below the block.
  - **Pseudocode** — always labeled; never presented as runnable.
- **Execution honesty:** the book claims "I ran this" only when it was actually executed during writing, and shows the command used. Untested code says so.

## 3. Writing Standards

- Audience model: an experienced frontend/full-stack engineer learning backend depth. Explain every infrastructure term on first use.
- Every "why" before every "how." Trade-offs stated explicitly; no technology presented as universally correct.
- Absolute claims avoided where behavior depends on version, configuration, or provider ("PostgreSQL *may* take a lock here depending on the alteration" — not "this always locks").
- Hypothetical numbers labeled *hypothetical*; real measurements include the method and environment.
- Distinguish **fact** (documented behavior), **recommendation** (author's judgment), and **assumption** (unverified at writing) with wording or explicit labels.

## 4. Diagram Standards

- Mermaid only, so every diagram renders in GitHub/VS Code/Obsidian; sources kept alongside exports in `diagrams/` when a diagram is reused.
- Failure paths drawn, not just happy paths, whenever the chapter has a Section 6 failure story.
- Node labels use real component names from the FormForge overview (API, workers, Redis, PG…).

## 5. Security Standards

- Secure defaults in every example: parameterized SQL, CSRF protection on cookie auth, strict CORS allowlists, TLS where in transit, bounded input sizes, no stack traces to clients.
- OWASP references (cheat sheets, Top 10) cited for security chapters.
- Chapter examples never weaken security "for simplicity" without calling out the exact risk and the production fix.

## 6. Honesty About Guarantees

Special care required for:

- **Exactly-once processing:** never claimed. The book teaches at-least-once + idempotent consumers, and names what each broker actually guarantees.
- **Distributed locks:** described as *leases with probabilistic safety* (per the Redlock critique), not magic.
- **Consistency:** always stated per-operation and per-store, never globally ("reads may be stale up to replica lag X" — not "it's consistent").
- **Rate limiting, caching, GC:** behaviors that vary by version/configuration are attributed with source links.

## 7. File and Numbering Conventions

- Chapter files: `NN-kebab-case-name.md` inside `NN-part-folder/`; chapter numbers global (01–111) and stable.
- Code folders: `book/code/NN-kebab-case-name/`, independently runnable.
- Cross-references: `→ Chapter NN (Topic Name)`.
- Status marks: ✍ = drafted this session, ✅ = complete & audited, ⬜ = not started.

## 8. Definition of Done (per chapter)

A chapter is complete when:

1. All 13 mandatory sections exist and none is a stub.
2. Every runnable code block exists in `book/code/` and, where the environment allowed, was executed; the execution evidence (command + outcome) is stated honestly.
3. Every diagram renders (valid Mermaid).
4. ≥5 edge cases and ≥5 anti-patterns (or an explicit justification for fewer when genuinely applicable).
5. Interview questions span Levels 1–5 with answers and misconceptions.
6. ≥3 scenarios and 3 exercises with separated solutions.
7. Cross-rerefs to prerequisite chapters are present and targets exist.
8. Progress tracker updated.
