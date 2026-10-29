# Chapter 26 — Query Optimization

> **Part III — Stability and Performance**  
> **Prerequisites:** Chapter 25 (Database Indexing), Chapter 28 (Connection Pooling)  
> **FormForge context:** The `LessonRepository.findById(id)` that runs a sequential scan on the `lessons` table — causing 2 seconds of latency per query during the course dashboard.

## 1. Definition and Fundamentals

- **What the concept is:** Query optimization is the practice of writing database queries that execute quickly and consume minimal resources by leveraging indexes, avoiding unnecessary scans, using appropriate join strategies, and selecting the right execution plan. It is the art and science of turning "correct" SQL into "fast" SQL.
- **Why it exists / what problem it solves:** A database can often execute a query in many ways. The query planner picks one — and if it picks a bad one (e.g., a sequential scan on a 10-million-row table), the query takes seconds instead of milliseconds. Query optimization addresses this: by understanding how the planner works, you can write queries that lead to good execution plans, add missing indexes, and avoid anti-patterns (e.g., `SELECT *`, `OR` conditions, functions on indexed columns) that force the planner into bad plans.
- **How it works internally (progressively deeper):** At the top level, the developer writes a query and the database's query planner (cost-based optimizer) generates multiple candidate plans and selects the cheapest. Below that, the planner estimates costs using table statistics (row counts, column distributions, histograms). At the lowest level, the plan executor walks the plan tree (e.g., a nested-loop join, a hash join, or an index scan) and fetches rows. Query optimization operates at two levels: the developer optimizes the query text (and adds indexes), and the database optimizes the plan (via statistics, configuration, and hints).
- **Where it fits in a typical application architecture:** Query optimization sits between the application layer and the database. It includes writing efficient queries, creating indexes, analyzing query plans, and tuning database configuration (work memory, parallel degree, join strategies).
- **A real-world analogy:** A librarian who must find a book. The naive approach: scan every shelf, every book, until you find the one. An optimized approach: know where the book is (an index), fetch the right shelf first, then open the book. Query optimization is that librarian: it knows the database's "indexes" and leads the planner along the path of least resistance.
- **A production example:** At FormForge, the `LessonRepository.findById(id)` runs a sequential scan on `lessons` (100k rows) because there is no index on `id`. Each query takes 2 seconds. The developer adds an index on `lessons.id` and rewrites the query to select only the needed columns. The query now takes 2ms — a 1000x improvement — and page load time drops from 6 seconds to 2.5 seconds.
- **When it is necessary / when it is unnecessary:** Necessary for any query that touches more than a few hundred rows, or any query that runs frequently (e.g., dashboard queries). Unnecessary for small, read-once queries (a few rows, single-table) where the planner already picks a good plan.

## 2. Types, Variants, and Classifications

- **Index scan (range/index):** The planner uses an index to find rows matching a WHERE clause or JOIN condition. Best for selective predicates.
- **Sequential scan:** The planner reads every row from the table. Fast for small tables or when no index exists and the planner estimates most rows will be returned.
- **Index-only scan:** The index contains all needed columns; the planner avoids fetching the table (avoids the heap). Requires a covering index.
- **Hash join / Merge join / Nested loop join:** Different physical join algorithms. The planner picks based on table sizes and available indexes.
- **Query rewriting:** The planner rewrites the SQL (e.g., `WHERE a OR b` → `UNION` of two queries) to find a better plan.
- **Cost-based optimizer (CBO) vs. rule-based optimizer (RBO):** CBO uses statistics to estimate costs; RBO uses fixed rules (obsolete in modern databases).
- **Comparison table:**

| Type | Best for | Cost | When to use |
|---|---|---|---|
| Index scan | Selective WHERE (few rows) | Low per row after index fetch | WHERE with high selectivity |
| Sequential scan | Full table reads, small tables | O(n) | No index + few rows, or bulk load |
| Index-only scan | Covering indexes (no heap fetch) | Low (no heap) | Queries returning only indexed columns |
## 3. Internal Working and Architecture

- **Step-by-step execution flow:**
  1. The application sends a SQL query to the database.
  2. The parser checks syntax and builds an internal representation (parse tree).
  3. The planner (CBO) generates candidate plans, estimates costs using statistics, and selects the cheapest.
  4. The executor walks the plan tree, fetches rows, and applies operators (filter, join, sort, aggregate).
```yaml
# docker-compose.yml
version: "3.8"
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: formforge
## 8. Performance and Scalability

- **Characteristics, complexity:** Query optimization is O(n) on table size (for sequential scan) or O(log n + k) (for index scan) where k = matches. Join complexity depends on the join algorithm: nested-loop O(n*m), hash O(n+m).
- **Latency/throughput implications:** An indexed query takes 1–10ms; a sequential scan takes 100ms–10s depending on table size. Adding the right index often gives 10–1000x improvement.
- **Resource use:** Index maintenance consumes CPU and I/O on writes. `work_mem` is allocated per query; too much causes OOM.
- **Benchmarking/load-testing:** Use `EXPLAIN ANALYZE` to get actual query times. Use `pg_stat_statements` to find top queries by total execution time.
## 11. Scenario-Based Engineering Problems

- **Scenario 1:** A search endpoint returns courses based on title, tags, and difficulty. The developer wrote `WHERE title ILIKE '%search%'` on a 10k-row table. The query takes 500ms.
  - *Problem statement:* The `ILIKE` with a leading wildcard prevents index usage.
  - *Constraints:* Can't change the search API.
  - *Options:* (a) Create a trigram index; (b) Use full-text search; (c) Accept the 500ms.
  - *Recommended solution:* (a) Create a trigram index (`CREATE INDEX ON courses USING gin(to_tsvector('english', title))`).
  - *Alternatives/trade-offs:* (b) is more powerful for multi-word search but adds complexity; (c) is simple but slow.
  - *Failure scenarios:* The trigram index is not used because of the `ILIKE` syntax.
  - *Testing strategy:* Verify the query plan uses the trigram index; measure p95 query time.

## 12. Hands-On Exercises

- **Beginner:** Write a query that fetches only the `id` and `title` of lessons in a course. Verify the planner uses an index on `course_id`.
- **Intermediate:** Add a composite index on `(course_id, status)` and verify the query uses it.
- **Advanced:** Create a covering index for a query that selects 3 columns from `lessons`.
- **Solutions:** Solutions are in `book/code/26-query-optimization/solutions/` (to be added).

## 13. Chapter Summary and Revision Notes

- **Five key takeaways:**
  1. Query optimization is the art of writing queries that lead to good execution plans.
  2. Indexes are the primary lever: an indexed query is 10–1000x faster than a sequential scan.
  3. Use `EXPLAIN` to analyze query plans and identify bad plans.
  4. Avoid anti-patterns: `SELECT *`, functions on indexed columns, missing statistics.
  5. Tune `work_mem` and `default_statistics_target` for complex workloads.
- **Quick revision sheet:** O(log n + k) for indexed scan; O(n) for sequential scan; EXPLAIN for plan analysis; ANALYZE for statistics.
- **Essential terminology:** Query optimizer, cost-based optimizer (CBO), index scan, sequential scan, covering index, hash join, nested loop join, index-only scan, ANALYZE, work_mem.
- **Important formulas/configuration:** `work_mem` = 64MB (per query); `DB_STATEMENT_TIMEOUT` = 5s; `default_statistics_target` = 100.
- **Decision-making checklist:** "How many rows does the query touch? Use EXPLAIN. Is there an index? Add one if not. Is the query frequent? Run ANALYZE."
- **Five flashcards:** What is query optimization? → Writing queries that lead to good plans. How to check a query plan? → EXPLAIN. What is a bad plan? → A sequential scan on a large table with no index. What is a covering index? → An index containing all columns needed by a query. How to tune work_mem? → Based on concurrency and RAM; keep peak under 70% of RAM.
- **Three comprehension-verification questions:**
  1. How would you optimize a 100M-row table's query that filters on one column?
  2. What is the impact of not running ANALYZE after a bulk load?
  3. How do you tune work_mem for a production system?
- **Authoritative references and further reading:** PostgreSQL documentation on `EXPLAIN`, `ANALYZE`, and `CREATE INDEX`; pg_stat_statements; "The Art of PostgreSQL" (Ch. 5).

---

> **Cross-Reference:** See → Chapter 25 (Database Indexing) for index creation, → Chapter 28 (Connection Pooling) for how query speed affects connection usage, and → Chapter 27 (N+1 Queries) for why query optimization does not fix N+1 problems.

---

> **FormForge context:** The `LessonRepository.findById` was originally a sequential scan on `lessons` (100k rows). Adding `CREATE INDEX ON lessons(id)` brought query time from 2s to 2ms. The dashboard query was also optimized by selecting only needed columns instead of `SELECT *`.

---

## Writing Guidance per Section

**Section 1** must be readable by someone who has never heard of the topic. Delay jargon; introduce it with its purpose attached ("a *query optimizer*..."). **Section 2** is where interviews are won or lost. Tables must compare *along dimensions that drive decisions* (cost, when to use) — not vague feature checklists. **Section 3** should leave the reader able to mentally step through the mechanism. If a diagram would help and the reader would benefit, draw it. Never describe a flow in prose that a 6-line sequence diagram would make obvious.

**Section 4** code must be internally consistent with the FormForge stack and with the `code/` directory. Label anything non-runnable as illustrative.

**Sections 6–7** are the anti-fragility core. Prefer failure stories that chain into other chapters (a rate-limit failure that becomes a retry storm that becomes a deadlock) over isolated trivia.

**Section 10** questions must test *decision-making*, not recall.

**Section 12** exercises must have checkable acceptance criteria.

## Cross-Reference Format

Use `→ Chapter NN (Topic Name)` inline. First mention in a chapter gets a one-line summary of why the link matters; later mentions can be bare. Example:

> Adding an index is a write-time cost that improves read performance. See → Chapter 29 (Read Replicas) for how to offload read traffic to a replica.

---

> **End of Chapter 26.**

- **Measurements:** Query: 2s (Seq Scan) → 2ms (Index Scan) after `CREATE INDEX ON lessons(id)`. Dashboard p95: 3s → 0.5s.

## 9. Testing and Debugging

- **Unit tests:** Verify the query plan uses the expected index (using `EXPLAIN` output).
- **Failure injection:** Remove the index; verify the query plan falls back to a sequential scan and query time increases.
- **Debug commands:** `EXPLAIN ANALYZE SELECT * FROM lessons WHERE id = 42;` on the DB to see the plan.
- **Metrics to check:** `pg_stat_statements` shows `rows` and `total_time` per query.
- **Expected failure signals:** `total_time` > 200ms on a dashboard query; high `rows` for a filtered query.

## 10. Follow-Up Interview Questions

- **Question 1 (Level 1):** What is a query optimizer?
  - *Answer:* A query optimizer is a database component that examines multiple ways to execute a query and selects the one that is estimated to be most efficient (lowest cost).
  - *Reasoning:* The planner chooses the best plan automatically based on statistics and cost estimates.
  - *Example:* For `SELECT * FROM users WHERE email = 'a@b.com'`, the planner may choose an index scan if an index exists, or a sequential scan if it estimates few rows.
  - *Common wrong answer:* "The optimizer rewrites the query automatically." (No — it only rewrites in some cases; it doesn't rewrite the semantics.)
  - *Follow-up:* What happens if the optimizer picks a bad plan? (Users see slow queries; fix by adding an index or rewriting the query.)
- **Question 2 (Level 2):** What is a covering index?
  - *Answer:* A covering index is an index that includes all the columns needed by a query, so the database can satisfy the query entirely from the index without fetching the table (heap).
  - *Reasoning:* The index-only scan avoids the join to the heap table, reducing I/O.
  - *Example:* If a query selects `id, name, email` from `users` and the index has all three columns, the query is served from the index only.
  - *Common wrong answer:* "A covering index is a separate index for the covering columns." (No — it's a single index containing all needed columns.)
  - *Follow-up:* How do you create a covering index? (CREATE INDEX ... ON table (columns) INCLUDE (extra_columns).)
- **Question 3 (Level 3):** How would you optimize a query that joins 10 tables?
  - *Answer:* (1) Add indexes on all join and WHERE columns. (2) Order the tables so the smallest first, to reduce the join size. (3) Use `EXPLAIN` to verify the join order. (4) Consider a temporary table or materialized view if the join is complex and repeated.
  - *Reasoning:* The planner uses join order to minimize intermediate result sizes.
  - *Example:* Join 10 tiny tables → nested-loop join is faster than hash join. Join 10 large tables → hash join or merge join.
  - *Common wrong answer:* "Just add an index on every column." (That slows writes; use indexes only on filtered columns.)
  - *Follow-up:* How do you know the join order the planner chooses? (Use `EXPLAIN` to see the `Nested Loop` or `Hash Join` node order.)
- **Question 4 (Level 4):** What is a stale statistics problem and how do you fix it?
  - *Answer:* Stale statistics occur when the table has changed significantly (e.g., a bulk load) but `ANALYZE` hasn't been run. The planner uses outdated row counts and picks a bad plan.
  - *Reasoning:* The planner's cost estimates are based on the last ANALYZE snapshot.
  - *Example:* A table has 100 rows; `ANALYZE` was run. A bulk load adds 1M rows. The planner still thinks there are 100 rows and chooses an index scan, which now returns 1M rows.
  - *Common wrong answer:* "The planner is always correct." (No — it relies on statistics.)
  - *Follow-up:* How do you schedule ANALYZE? (autovacuum does it automatically; set `autovacuum_analyze_threshold` for high-churn tables.)
- **Question 5 (Level 5):** How would you tune `work_mem` for a system with 2000 queries per second and 8GB RAM?
  - *Answer:* Use `work_mem = 64MB`. Each query allocates `work_mem` for sorting/hashing. With 2000 q/s, not all queries run concurrently. If 200 queries run concurrently, 200 * 64MB = 12GB is the worst-case memory. Tune to keep the peak under 70% of RAM.
  - *Reasoning:* `work_mem` is per-query, not per-connection. Concurrent queries share memory if they sort/hash simultaneously.
  - *Example:* 2000 q/s, average 50 concurrent queries, `work_mem` = 64MB → 50 * 64MB = 3.2GB.
  - *Common wrong answer:* "Set `work_mem` to 1GB for every query." (That will OOM the DB under concurrency.)
  - *Follow-up:* How do you measure the impact of `work_mem`? (Use `EXPLAIN` to see the sort/hash memory used; monitor `memory_context` usage metrics.)

      POSTGRES_USER: formforge
      POSTGRES_PASSWORD: secret
    command: >
      postgres
      -c shared_preload_libraries=pg_stat_statements
      -c pg_stat_statements.track=all
```

- **Configuration (env vars, config files):**
  - `DB_STATEMENT_TIMEOUT=5000` (5s)
  - `DB_WORK_MEM=64MB`

## 5. Production-Ready Implementation

- **What must change before real deployment:**
  - **Scalability:** For tables >1M rows, add covering indexes. Evaluate index maintenance cost (writes slow down); consider a partial index for frequently filtered columns.
  - **Security:** Use parameterized queries (to prevent SQL injection). Never build queries with string concatenation.
  - **Secrets:** Store DB credentials in a secrets manager; never commit them to the repository.
  - **Resources:** The planner uses `work_mem` per query. For 100 concurrent queries, `work_mem` is per-query (not shared), so adjust `work_mem` to limit memory per query.
  - **Timeouts:** Set `statement_timeout` to prevent runaway queries (e.g., 5s on dashboards, 30s on admin pages).
  - **Failure handling:** If a query exceeds `statement_timeout`, the connection is closed and the caller returns a 504. Log the query for analysis.
  - **Deployment/rollback:** Deploy query changes and index changes as a two-phase deploy (create index, then change query text). Rolling index creation prevents long locks.
  - **Testing:** Load test with `k6`; verify p95 query time and that no query exceeds `statement_timeout`.

## 6. Edge Cases and Failure Scenarios

- **Scenario:** A table has 10M rows; a query without an index takes 120 seconds.
  - *Cause:* Sequential scan on a large table.
  - *Impact:* The service times out (5s); users see failures; the DB is saturated.
  - *Detection:* `pg_stat_statements` shows the slow query; `EXPLAIN` shows `Seq Scan`.
  - *Prevention/mitigation:* Add an index on the filtered column. Set `statement_timeout` to kill runaway queries.
  - *Test:* Simulate a production-like load; verify the index improves query time by 100x.
- **Scenario:** A composite index exists but the query filters on only one column of the index.
  - *Cause:* The query planner chooses to use the first column of the index; the second column is unused.
  - *Impact:* The index is still useful, but a covering index might reduce the cost further.
  - *Detection:* `EXPLAIN` shows `Index Scan` using the composite index.
  - *Prevention/mitigation:* Create a partial index on the filtered column, or accept the existing index for now.
  - *Test:* Verify the query plan still uses the existing index.

## 7. Common Mistakes and Anti-Patterns

- **Mistake:** Using `SELECT *` to fetch all columns.
  - *Why devs choose it:* "I'll just ask for everything. It's easy."
  - *Why it fails:* The planner fetches all columns from the heap (not just what the app needs), hit by row amplification.
  - *Correct alternative:* Select only the columns the app needs.
  - *Real-world consequence:* A query fetching 50MB of data when only 2MB is needed; cache pressure and latency.
- **Mistake:** Using a function on an indexed column (e.g., `WHERE LOWER(email) = 'x'`).
  - *Why devs choose it:* "I want case-insensitive search."
  - *Why it fails:* The planner cannot use the index on `email`; it does a sequential scan.
  - *Correct alternative:* Create a functional index: `CREATE INDEX ON users (LOWER(email))`.
  - *Real-world consequence:* 10x slower queries; CPU spikes on the DB.
- **Mistake:** Over-indexing the table.
  - *Why devs choose it:* "More indexes are better."
  - *Why it fails:* Each write updates all indexes; the app becomes slower under write load.
  - *Correct alternative:* Index only columns used in WHERE, JOIN, and ORDER BY. Drop unused indexes.
  - *Real-world consequence:* Write throughput drops 50% after adding 50 indexes.
- **Mistake:** Not running `ANALYZE` after bulk data loads.
  - *Why devs choose it:* "The planner should figure it out."
  - *Why it fails:* Stale statistics lead to bad plans (e.g., assuming 100 rows but 1M rows).
  - *Correct alternative:* Run `ANALYZE table_name` after bulk loads or schedule autovacuum.
  - *Real-world consequence:* The planner picks a sequential scan when an index would be better, causing 1000x slowdown.

  5. The result set is returned to the application and closed.

```mermaid
graph TD
    A[Query] --> B[Parser]
    B --> C[Planner (CBO)]
    C --> D[Generate Plans]
    D --> E[Estimate Costs]
    E --> F[Select Cheapest]
    F --> G[Executor]
    G --> H[Scan -> Filter -> Join]
    H --> I[Result Set]
```

- **Failure paths drawn explicitly:**
  - **Stale statistics:** The planner uses outdated row counts and picks a bad plan. Mitigation: run `ANALYZE` or set `autovacuum_analyze_threshold`.
  - **Incorrect join order:** The planner joins large tables first, causing a cartesian product. Mitigation: add indexes on join columns; use `/*+ INDEX(...) */` hints if supported.
  - **Memory pressure:** The planner uses too much memory for a hash join, spilling to disk and slowing the query. Mitigation: increase `work_mem` or split the query.
  - **Bad index usage:** The planner ignores an existing index because the predicate uses a function (e.g., `WHERE lower(name) = 'x'`). Mitigation: rewrite the query or create a functional index.
- **Algorithms and complexity:**
  - Query planner: generates plans using dynamic programming; complexity O(n * 2^n) where n = number of tables in the join.
  - Index scan: O(log n) to find the first matching row; O(k) to fetch k rows (where k = number of matches).
  - Sequential scan: O(n) to scan n rows.
  - Hash join: O(n + m) where n = outer table, m = inner table.
- **Important configuration parameters with safe defaults:**
  - `enable_seqscan` = true (allow sequential scans when cost-effective)
  - `work_mem` = 4MB (memory for hash joins/sorts; per-query)
  - `effective_cache_size` = 4GB (hints the planner about OS cache size)
  - `default_statistics_target` = 100 (column histogram detail)

---

## 4. Practical Implementation

- **Scenario → Requirements (functional + non-functional):**
  - *Scenario:* The course dashboard lists all lessons in a course. The current query scans `lessons` (100k rows) and takes 2s.
  - *Functional requirements:* The dashboard must load in <500ms.
  - *Non-functional requirements:* p95 query time < 100ms; no query adds more than 10% overhead to the response.

- **Technology stack:** PostgreSQL, EXPLAIN, pg_stat_statements.

- **Project structure:**
  ```
  book/code/26-query-optimization/
  ├── src/
  │   ├── repository/LessonRepository.ts
  │   ├── queries/dashboard.ts
  │   └── analysis/query-plans.md
  ├── config/db-config.yaml
  └── README.md
  ```

| Hash join | Large, unindexed joins | O(n+m) | When no index exists for a join |
| Nested loop join | Small outer table + index on inner | O(n*m) worst | When outer table is small |

**Decision guide:** Choose an index scan when the predicate is selective (returns <5% of rows). Choose a sequential scan when returning a large fraction of rows, or when the table is small (<1000 rows). Create covering indexes when the query only needs indexed columns (index-only scan).
