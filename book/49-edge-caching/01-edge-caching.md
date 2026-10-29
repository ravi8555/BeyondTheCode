# Chapter 49 — Edge Caching

> **Part IV — Advanced Patterns**  
> **Prerequisites:** Chapter 44 (Caching), Chapter 21 (Distributed Locks)  
> **FormForge context:** The global CDN edge nodes that cache `lesson:*` and `course:*` pages for low-latency global delivery.

## 1. Definition and Fundamentals

- **What the concept is:** Edge caching is the practice of storing copies of content at the closest point of presence (PoP) to the end user — typically in a CDN, reverse proxy, or distributed cache — so that reads are served from a location near the user rather than the origin. It is caching as a geographic optimization.
- **Why it exists / what problem it solves:** The origin server may be hundreds of milliseconds away. Even a simple HTML page incurs 200–500ms of network latency per round trip. Edge caches sit in hundreds of PoPs worldwide, serving reads in 10–30ms. For a book reader that serves PDFs, images, and HTML to users in 200+ countries, this is the difference between a responsive and a sluggish experience.
- **How it works internally (progressively deeper):** At the top level, an edge node receives an HTTP GET for `/courses/42/lessons/1`. It checks its local cache. If present and fresh, it returns immediately. If missing or stale, it forwards to the origin (or to a closer intermediate node), caches the response with a TTL, and returns it. Below that, the edge uses a consistent hashing scheme to distribute cache keys across PoPs, and a push-based propagation system (or pull-based LRU eviction) to keep the cache coherent. At the lowest level, the edge runs a request coalescing layer: if 50 simultaneous users request the same page, only one fetch to the origin happens, and the rest are filled from that single cache fill.
- **Where it fits in a typical application architecture:** Edge caching sits between the user and the application origin. It intercepts reads at the network edge, before any application logic runs. It can cache HTML (full page), HTTP (static assets), and API responses (JSON) depending on cacheability.
- **A real-world analogy:** A bookstore has a kiosk at every airport. When you land, you don't run to the main store in the city center — you go to the kiosk that carries the same bestseller. If the kiosk is out of stock, it paged the main store, and once the book is back in stock, it's refreshed at the kiosk.
- **A production example:** FormForge hosts its book reader on Vercel/Netlify with a Cloudflare CDN in front. When a user in Japan requests `/courses/10/lessons/42`, the CDN edge node in Tokyo serves the HTML from local cache in ~2ms. The origin (US) is not involved. The CDN uses a `Cache-Control: max-age=600` header on the origin response; the edge caches for 600s, then revalidates with `If-None-Match` (ETag).
- **When it is necessary / when it is unnecessary:** Necessary for static assets (images, PDFs, JS, CSS), HTML pages that change rarely, and API responses that are read-only and versioned. Unnecessary for user-specific private data (e.g., a student's quiz progress), mutable data that must be always consistent, or data that is requested only once per user (no cache benefit).

## 2. Types, Variants, and Classifications

- **Full-page caching (HTML):** The entire rendered HTML is stored. Fastest, but requires cache invalidation on writes. Example: `/courses/10/lessons/42` page.
- **HTTP caching (static assets):** Images, PDFs, JS, CSS with `Cache-Control: max-age`. Etags and Last-Modified control revalidation. No app logic involved.
- **API response caching (JSON):** The JSON response of an endpoint is cached at the edge. Requires request normalization (query params, headers). Example: `GET /courses/10/lessons?status=published`.
- **Edge-side includes (ESI):** The edge node assembles fragments from different origins. The HTML contains `<esi:include src="/courses/10/head.html">`; the edge replaces the ESI tag with the cached fragment.
- **Cache-as-a-service:** The edge is a managed cache with its own API, separate from CDN infrastructure. Example: Cloudflare Workers + KV, or Fastly Compute with VCL.
- **Comparison table:**

| Strategy | Cacheable | Invalidation complexity | Hit ratio | Use case |
|---|---|---|---|---|
| Full-page | HTML, JSON (signed) | High (needs invalidation) | High | Public course pages |
| Static assets | Any static file | Low (version query param) | Very high | Images, JS, CSS |
| API JSON | Signed requests only | Medium (symbolic TTL) | Medium | Quiz results, progress |
| ESI fragments | Fragments | Low to medium | Medium | Mixed page assembly |
| Cache-as-a-service | Arbitrary | Medium | High | Dynamic pages |

**Decision guide:** Choose full-page caching when you can accept stale content for a short period. Choose static asset caching when files are immutable (use versioned URLs). Choose API caching when responses can be signed and are publicly readable.
