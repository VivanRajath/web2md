# web2md — Architecture

A deep explanation of the design, data flow, module responsibilities, and key decisions in the web2mdcodebase.

---

## Purpose and Design Philosophy

Most AI agent workflows that involve web research operate by passing a URL to the agent, which then fetches the page in real time, strips HTML, extracts text, and reasons over the content — all inside the context window. Every step of that pipeline consumes tokens. On a single page this is tolerable. On a documentation site with 50 or 100 pages, the mechanical overhead of fetching and parsing dominates the context window, leaving little room for actual reasoning.

web2md relocates that pipeline entirely to the local filesystem. A single CLI invocation fetches, parses, deduplicates, and structures an entire site into plain Markdown files. The agent then reads local files. It never sees HTML, never makes HTTP requests, and never wastes tokens on navigation menus, footers, or cookie banners. The output is also structured for direct RAG ingestion — chunk files with YAML frontmatter can be embedded into a vector store without any additional pre-processing.

The codebase is organised around a strict separation of concerns: crawling, parsing, and exporting are independent layers that communicate through a typed in-memory registry. No layer has knowledge of the others' internals.

---

## High-Level Data Flow

```
CLI arguments
     |
     v
  runCLI()  [cli/cli.ts]
     |
     v
  runSiteCrawler()  [crawler/SiteCrawler.ts]
     |
     +---> UrlFilter       initialised with seed URL, include/exclude rules
     |
     +---> CrawlQueue      seed URL enqueued at depth 0
     |
     +--- BFS loop ---+
     |                |
     |         fetchHTML()       axios GET -> raw HTML string
     |                |
     |         extractReadableContent()   JSDOM + Readability -> { title, content (HTML) }
     |                |
     |         extractLinks()    Cheerio -> all href values -> resolved absolute URLs
     |                |
     |         htmlToMarkdown()  Turndown -> Markdown string
     |                |
     |         registry.register()  slug generation, store PageRecord
     |                |
     |         enqueue outbound URLs (filtered, not already seen)
     |
     v
  writePages()         [exporters/pageWriter.ts]
     |                  writes pages/ directory
     v
  writeChunks()        [exporters/chunkWriter.ts]  (optional)
     |                  writes chunks/ directory
     v
  writeSiteIndex()     [exporters/siteIndexWriter.ts]
                        writes index.md, sitemap.json, metadata.json
```

---

## Module Breakdown

### Entry Point — `src/index.ts`

Minimal. Imports `runCLI` from `cli/cli.ts` and calls it. All logic is delegated.

---

### CLI Layer — `src/cli/cli.ts`

Built on [Commander](https://github.com/tj/commander.js). Defines the public interface of the tool.

Responsibilities:
- Declare the command name, description, positional `<url>` argument, and all option flags
- Collect repeatable `--include` and `--exclude` values into arrays using a reducer
- Map CLI option values to a typed `CrawlOptions` object
- Route execution to `runSiteCrawler()`

Key design decision: the CLI does not branch between single-page and crawl mode with separate code paths. Instead it passes `maxDepth: 0` and `maxPages: 1` when `--crawl` is not set. The crawler handles both cases with the same BFS loop. A page at depth 0 with a page cap of 1 produces exactly one page and stops.

```typescript
maxDepth: options.crawl ? parseInt(options.depth) : 0,
maxPages: options.crawl ? parseInt(options.maxPages) : 1,
```

---

### Crawler — `src/crawler/SiteCrawler.ts`

The orchestrator. Owns the BFS crawl loop and coordinates all other modules.

**Exported types:**

`CrawlOptions` — input configuration

```typescript
{
  maxDepth: number;
  maxPages: number;
  include?: string[];
  exclude?: string[];
  chunks?: boolean;
}
```

`CrawlStats` — output telemetry written to `metadata.json`

```typescript
{
  seedUrl, crawledAt, durationMs,
  attempted, succeeded, skipped,
  totalWords, avgWordsPerPage, maxDepthReached,
  totalChunks, options, failedUrls
}
```

`CrawlResult` — return value of `runSiteCrawler()`

```typescript
{ registry: PageRegistry, hostname: string, stats: CrawlStats }
```

**BFS loop walkthrough:**

1. `UrlFilter` and `CrawlQueue` are initialised. The normalised seed URL is enqueued at depth 0.
2. While the queue is not empty and the page cap has not been reached:
   a. Dequeue the next entry. Skip if its depth exceeds `maxDepth`.
   b. `fetchHTML()` — axios GET with a 10 second timeout. On failure, log the URL to `failedUrls` and continue.
   c. `extractReadableContent()` — JSDOM + Mozilla Readability. On failure, log and continue. If Readability returns no content, skip silently.
   d. `extractLinks()` — Cheerio parses the raw HTML and resolves all `href` values to absolute URLs.
   e. Each outbound URL is normalised by `UrlFilter.normalize()`, then tested by `UrlFilter.allow()`. Only those that pass are retained.
   f. `htmlToMarkdown()` converts the Readability HTML output to Markdown.
   g. `registry.register()` generates a unique slug and stores a `PageRecord`.
   h. If the current depth is less than `maxDepth`, allowed outbound URLs not already seen are enqueued at `depth + 1`.
3. After the loop, `writePages()`, optionally `writeChunks()`, and `writeSiteIndex()` are called in order.

**Why Readability and not raw Cheerio?**

Readability was built by Mozilla for the Firefox Reader View. It models the semantic structure of an article — identifying the main content block, removing navigation, ads, sidebars, and footers. Raw Cheerio would require per-site CSS selector rules. Readability works across sites without configuration, which is the right trade-off for a general-purpose tool.

**Why link extraction uses raw HTML and not Readability output?**

Readability intentionally strips navigation and structural elements to isolate article content. Those stripped elements often contain the internal links we need to continue crawling. Link extraction is therefore performed on the original raw HTML, not the Readability output.

---

### Crawl Queue — `src/crawler/CrawlQueue.ts`

A FIFO queue backed by an array plus a `Set<string>` for seen-URL deduplication.

`enqueue(url, depth)` — adds an entry only if the URL has not been seen before. The seen-set is updated immediately on enqueue, not on dequeue, so a URL that appears in the outbound links of multiple pages is only enqueued once even before it is processed.

`next()` — shifts from the front of the array (FIFO = breadth-first order).

`hasSeen(url)` — external check used by `SiteCrawler` before calling `enqueue`, so it can also skip URLs already in the `PageRegistry`.

BFS order is important: it ensures that every page is reached at the minimum possible depth, which gives the most meaningful values in `index.md` and `metadata.json`.

---

### Page Registry — `src/crawler/PageRegistry.ts`

An in-memory store of all successfully crawled pages, keyed by URL.

**PageRecord shape:**

```typescript
{
  url: string;          // original URL
  slug: string;         // derived filename slug (collision-safe)
  filename: string;     // slug + ".md"
  title: string;        // from Readability
  depth: number;        // BFS depth
  outboundUrls: string[]; // filtered outbound links
  markdownContent: string;
  wordCount: number;    // word count of markdownContent
}
```

**Slug generation:**

`urlToSlug()` in `utils/slugify.ts` transforms the URL pathname:

1. Strip trailing slashes
2. Strip leading slashes
3. Replace `/` path separators with `-`
4. Replace non-word characters with `-`
5. Collapse consecutive dashes
6. Lowercase

The root path `/` becomes `index`.

`makeUniqueSlug()` appends a numeric counter (`-2`, `-3`, ...) if the base slug is already in the registry's `usedSlugs` set. This guarantees that two different URLs that map to the same slug never overwrite each other's files.

---

### URL Filter — `src/crawler/UrlFilter.ts`

Stateless filter for deciding which URLs the crawler is allowed to follow.

**`allow(url)`** applies rules in this order:

1. URL must parse without error
2. Hostname must match the seed hostname (same-domain only)
3. Protocol must be `http:` or `https:`
4. URL must not have a hash fragment (fragments point to anchors on already-crawled pages)
5. File extension must not be in `BLOCKED_EXTENSIONS`
6. Pathname must not contain any string in `BLOCKED_PATH_SEGMENTS`
7. If `--include` prefixes were specified, the pathname must start with at least one of them
8. Pathname must not start with any `--exclude` prefix

Rules are checked in short-circuit order. A URL that fails rule 2 never reaches rule 7.

**`normalize(url)`** strips the hash, strips the query string, and removes trailing slashes (except for the root `/`). This canonical form is what is stored in the queue and registry, ensuring that `https://site.com/page?ref=nav` and `https://site.com/page` are treated as the same URL.

**Git Bash path normalisation:**

On Windows, Git Bash expands bare POSIX paths passed as arguments. `/docs` becomes `C:/Program Files/Git/docs` before the process receives it. `normalizePathPrefix()` detects this pattern by looking for known Git/MSYS/Cygwin/MinGW root directory names and recovers the original path suffix. For generic Windows absolute paths without those markers, it strips the drive letter and first directory.

---

### Parser Layer

Three focused modules, each with a single responsibility.

**`parser/readability.ts`**

Wraps `jsdom` and `@mozilla/readability`. Creates a JSDOM virtual DOM from the raw HTML string (with the page URL passed as the base URL so relative resources resolve correctly), runs Readability's `parse()`, and returns `{ title, content }` where `content` is an HTML string of the main article body. Returns `{ title: "Untitled", content: "" }` on failure.

**`parser/htmlParser.ts`**

Cheerio-based helpers for extracting information from raw HTML. Currently used for link extraction in `SiteCrawler.ts` via the `extractLinks()` function, which selects all `a[href]` elements and resolves each href to an absolute URL using the native `URL` constructor.

**`parser/markdown.ts`**

Wraps [Turndown](https://github.com/mixmark-io/turndown). Converts an HTML string to Markdown. Turndown handles common HTML elements — headings, paragraphs, lists, code blocks, tables, links, images — and produces clean, readable Markdown with minimal noise.

---

### Exporter Layer

Four exporters, each writing one type of output artifact.

**`exporters/pageWriter.ts`**

Writes one `.md` file per `PageRecord` to `output/<hostname>/pages/`.

Each file follows this structure:

```
# <title>

<markdownContent>

## Related Pages

- [Title A](./slug-a.md)
- [Title B](./slug-b.md)
```

The Related Pages section is built by looking up each URL in `page.outboundUrls` against the `PageRegistry`. Only URLs that were successfully crawled produce entries. Links are relative file paths within the `pages/` directory, so the knowledge base is navigable offline without any server.

**`exporters/chunkWriter.ts`**

Splits each page's Markdown on `##` heading boundaries and writes one file per chunk.

`splitIntoChunks()` processes the Markdown line by line. When it encounters a line starting with `## `, it flushes the current accumulated lines as a chunk and starts a new one with that heading. Content before the first `##` heading is treated as a chunk with an empty heading (the frontmatter will omit the `section` field for these).

Each chunk file is written to `output/<hostname>/chunks/<page-slug>/chunk-NNN.md` with zero-padded three-digit numbering.

`buildFrontmatter()` produces the YAML block:

- `source` — the original URL of the page
- `title` — the page title from Readability
- `page` — relative path to the full page file
- `chunk` — 1-based index of this chunk within the page
- `total` — total number of chunks for this page
- `section` — the `##` heading text (omitted if the chunk precedes all headings)

This frontmatter schema is designed for direct ingestion by vector store loaders that read YAML frontmatter as document metadata.

**`exporters/siteIndexWriter.ts`**

Writes three files:

`index.md` — a Markdown table of all pages sorted by depth then slug, with columns for title (linked to the page file), word count, estimated reading time, depth, and source URL. Reading time is calculated at 200 words per minute with a minimum of 1 minute. Any failed URLs are listed in a separate section at the bottom.

`sitemap.json` — a JSON array where each entry contains:

```json
{
  "url": "https://...",
  "slug": "getting-started",
  "filename": "pages/getting-started.md",
  "title": "Getting Started",
  "depth": 1,
  "wordCount": 842,
  "readingTimeMin": 5,
  "linksTo": ["pages/installation.md", "pages/api-reference.md"]
}
```

`linksTo` is resolved from the page's outbound URLs through the registry. Only URLs that were actually crawled appear. This forms a navigable page graph that an agent or tool can traverse without reading individual files.

`metadata.json` — the full `CrawlStats` object serialised as JSON.

**`exporters/markdownExport.ts` and `exporters/jsonExport.ts`**

Single-file exporters used in single-page mode. Write a `.md` or `.json` file to a specified output path.

---

### Utility Layer

**`utils/fetch.ts`**

Thin Axios wrapper with a `Mozilla/5.0 web2md` User-Agent header. In single-page mode (used directly) it exits the process on failure. In crawl mode the inlined `fetchHTML()` inside `SiteCrawler.ts` is used instead, which throws on failure so the caller can log and continue rather than exit.

**`utils/slugify.ts`**

Two functions: `urlToSlug()` and `makeUniqueSlug()`. Described in the PageRegistry section above.

**`utils/url.ts`**

Converts a URL to a default output filename for single-page mode. Extracts the hostname and pathname, joins them with a dash, strips non-word characters, and appends `.md`.

---

## Data Lifecycle Summary

```
URL string
  -> UrlFilter.normalize()         canonical URL (no hash, no query, no trailing slash)
  -> CrawlQueue.enqueue()          FIFO queue entry at a given depth
  -> fetchHTML()                   raw HTML string
  -> extractReadableContent()      { title: string, content: string (HTML) }
  -> htmlToMarkdown()              Markdown string
  -> PageRegistry.register()       PageRecord (with slug, wordCount, filename)
  -> writePages()                  pages/<slug>.md
  -> writeChunks() (optional)      chunks/<slug>/chunk-NNN.md (with YAML frontmatter)
  -> writeSiteIndex()              index.md, sitemap.json, metadata.json
```

---

## Architectural Constraints and Trade-offs

**Sequential crawling**

The BFS loop is synchronous — one page at a time with an `await` on each fetch. This means a 100-page site with an average 300ms round-trip time takes around 30 seconds. The trade-off is simplicity and compliance: concurrent fetching risks triggering rate limits or IP bans on documentation hosts, and adds complexity around shared state in the queue and registry. For the intended use case (running once to build a local knowledge base), the sequential approach is acceptable.

**In-memory registry**

All `PageRecord` objects are held in memory for the lifetime of the crawl. For sites with thousands of pages and long articles this could become a constraint. The current design targets documentation sites in the tens-to-low-hundreds of pages range. A streaming or disk-backed registry would be the right upgrade path for larger crawls.

**Readability as the only content extractor**

Readability is excellent at article content but can struggle with certain page structures — heavy JavaScript-rendered SPAs, pages where the main content is in a `<section>` that Readability does not identify as the article body, or pages with no prose at all (pure table or code). Pages where Readability returns empty content are silently skipped. This is the correct behaviour: writing an empty or near-empty file adds noise to the knowledge base.

**No JavaScript rendering**

Axios fetches the raw server-rendered HTML. Pages that require JavaScript execution to render their content (React, Vue, Next.js client-side routes) will return either empty content or only the static shell. This is a deliberate constraint — adding a headless browser would make the tool significantly heavier. For JS-rendered sites, a pre-rendered or SSR version of the content is required.

**Chunk boundary at `##` only**

Chunks are split on second-level headings only. This produces chunks that are semantically coherent sections of a page. Splitting on every heading level would produce fragments that lack context; not splitting at all would produce chunks too large to embed efficiently. The `##` level is a reasonable default for most documentation structures, where `#` is the page title and `##` marks major sections.

---

## Output as a Knowledge Base

The `output/<hostname>/` directory is designed to be self-contained and directly usable:

- An agent can read `index.md` to understand what pages exist and navigate by title
- An agent can read `sitemap.json` to programmatically traverse the page graph without reading individual files
- An agent can read `metadata.json` to understand the provenance, coverage, and settings of the crawl
- Each `pages/*.md` file is a clean, self-contained document with relative links to related pages
- Each `chunks/<slug>/chunk-NNN.md` file is a RAG-ready embedding unit with all necessary metadata in its frontmatter

The intent is that the entire `output/<hostname>/` directory can be committed to a repository, referenced by an agent configuration, or loaded into a vector store — and the agent can then work entirely from local content with no further web access required.
