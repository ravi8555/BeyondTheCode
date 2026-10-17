# Preface

## Why This Book Exists

Most engineers learn backend concepts the expensive way: a cache stampede takes down production at 2 a.m., a retry storm doubles load on an already-failing dependency, a migration locks a table for eleven minutes. The knowledge arrives as scar tissue.

This book compresses that timeline. Each of the 111 topics is explained on five levels — what it is, how it works internally, how to build it with real code, how it breaks under production load, and how to defend the design in an interview or incident review. The goal is not memorization. It is *judgment*: knowing which tool to reach for, which trade-off you are accepting, and what you will have to explain in the postmortem.

## Who Should Read This Book

You should read this book if you:

- Build web applications with JavaScript/TypeScript (React, Next.js, Node.js, Express) and want to move from "it works on my machine" to "it survives Black Friday."
- Know SQL, PostgreSQL, MongoDB, Docker, Linux, Nginx, PM2, Git — and suspect you understood only 40% of what those tools actually do.
- Are preparing for backend, full-stack, DevOps, or system design interviews and want answers built on understanding rather than scripts.
- Have built SaaS or AI-powered products and keep hitting the same missing pieces: queues, retries, observability, multi-node consistency, cost control.

This book is **not** a reference manual for one cloud vendor (examples run locally with Docker), **not** a collection of context-free snippets, and **not** a claim that every application needs Kubernetes, microservices, or a message broker. Every chapter states when a concept is *unnecessary* at your stage.

## Prerequisites

### Skills assumed

| Area | Expected knowledge |
|---|---|
| JavaScript/TypeScript | Async/await, Promises, closures, modules, basic generics |
| Node.js | HTTP servers, middleware, npm/pnpm, `node:` built-ins |
| HTTP/REST | Methods, status codes, headers, cookies, CORS at a basic level |
| SQL | SELECT/JOIN/INDEX basics, primary and foreign keys |
| Docker | Running containers, volumes, ports, Dockerfile, Compose basics |
| Linux | Shell navigation, `curl`, environment variables, processes, logs |
| Git | Branching, merging, pull requests |

Everything beyond this — networking fundamentals, distributed-systems theory, cryptography concepts — is explained in the chapter where it first appears.

### Environment setup

| Tool | Version assumption | Verify with |
|---|---|---|
| Node.js | 22 LTS (20+ works) | `node --version` |
| npm | 10+ (or pnpm 9+) | `npm --version` |
| Docker + Compose v2 | recent stable | `docker --version && docker compose version` |
| Git | 2.40+ | `git --version` |
| curl | any recent | `curl --version` |

Optional per chapter: `psql`, `redis-cli`, `k6`, `terraform`, `kubectl`, `helm`.

> **Version honesty note:** these versions are *assumptions made when writing*, not live-verified claims. Check official documentation before running anything — APIs and config syntax change.

Verify the base setup:

```bash
node --version        # expect v20+ (v22 LTS preferred)
docker run --rm redis:7-alpine redis-cli --version   # expect redis-cli 7.x
```

## How to Study Each Chapter

Every chapter follows the same 13-section structure (see [`00-chapter-template.md`](00-chapter-template.md)):

1. **Definition and Fundamentals** — read once for the mental model.
2. **Types, Variants, and Classifications** — focus on comparison tables and the decision guide.
3. **Internal Working and Architecture** — study the diagrams until you can redraw them from memory.
4. **Practical Implementation** — *run the code.* Not optional; later sections build on it.
5. **Production-Ready Implementation** — the gap between "demo" and "on-call rotation."
6. **Edge Cases and Failure Scenarios** — the section that pays your salary. Reproduce at least one failure per chapter.
7. **Common Mistakes and Anti-Patterns** — skim now, re-read before any design review.
8. **Performance and Scalability** — understand complexity and bottlenecks; distrust unlabeled benchmarks.
9. **Testing and Debugging** — run the tests; break things on purpose.
10. **Follow-Up Interview Questions** — self-quiz out loud. Saying an answer is different from knowing it.
11. **Scenario-Based Engineering Problems** — cover the answer, solve the scenario, then compare.
12. **Hands-On Exercises** — beginner → intermediate → advanced. Attempt before reading the solutions.
13. **Chapter Summary and Revision Notes** — your one-page revision sheet.

**Suggested rhythm:** one chapter per sitting for Parts I–III; two sittings for the dense ones (Distributed Transactions, Saga Pattern, Sharding, Multi-Region Deployment).

**Active-recall loop:** after a chapter, close it and answer the three verification questions at the end. If you hesitate, reread sections 3, 6, and 10 before moving on.

## The Running Example

All chapters reference **FormForge**, a fictional SaaS form-builder platform (Typeform/Jotform-style) with a Next.js frontend, Node.js/TypeScript API, PostgreSQL, Redis, a message broker, Docker-based local development, and a path to Kubernetes. The architecture grows chapter by chapter — it starts as a small monolith, because that is what real products start as. See [`00-architecture-overview.md`](00-architecture-overview.md).

## Conventions and Honesty Rules

- Code marked **runnable** lives in `code/` and is meant to be executed. Code marked **illustrative** shows shape and flow; the chapter then lists what production would add.
- Benchmarks appear as facts only if actually run; anything else is labeled *hypothetical* with a reproducible measurement method.
- Security examples use secure defaults and placeholder credentials (`postgres_dev`, `your-key-here`). Real secrets never appear.
- Where behavior depends on infrastructure, versions, or configuration, the text says so instead of pretending one answer exists.

## A Final Word

Read with a terminal open. Type the commands. Break the examples. The engineers who internalize this material are not those who read the most chapters — they are the ones who made the rate limiter return 429 at exactly the wrong moment, read the logs, and understood why.

