# webb2md

Convert any website into a local, structured Markdown knowledge base — built for AI agents and humans who need to reason over web content without wasting tokens.

## Documentation

- [Architecture Guide](./ARCHITECTURE.md)
- [Runbook](./RUNBOOK.md)

---

## Installation

**Run without installing (recommended):**

```bash
npx webb2md <url>
```

**Install globally:**

```bash
npm install -g webb2md
webb2md <url>
```

**Install locally in a project:**

```bash
npm install webb2md
npx webb2md <url>
```

---

## The Problem

When an AI agent is asked to research a webpage, it spends the majority of its context window on mechanical work: fetching a URL, stripping HTML boilerplate, parsing navigation and footers, extracting text, and formatting it. None of that processing is the task — it is overhead. On large documentation sites with dozens of pages, the token cost of this pipeline can make the actual reasoning task impractical.

## What webb2md Does

webb2md is a CLI tool that moves all of that overhead out of the agent and onto the local filesystem. You run it once against a URL or an entire site. It fetches, parses, cleans, and converts every page into plain Markdown, then writes a structured directory to disk. From that point forward, an agent reads local files — no fetching, no parsing, no HTML — only content.

The output is also structured for retrieval-augmented generation (RAG). With the `--chunks` flag, every page is split on its `##` headings into individual chunk files, each with YAML frontmatter that records the source URL, page title, section heading, chunk index, and total chunk count. A vector store can ingest these chunks directly without any pre-processing.

---

## Features

- Single-page fetch: convert any URL to a `.md` file in one command
- Full-site crawl: follow internal links up to a configurable depth and page cap
- RAG-ready chunking: split pages by `##` headings into chunk files with YAML frontmatter
- Hierarchical output directory: `pages/`, `chunks/`, `index.md`, `sitemap.json`, `metadata.json`
- URL filtering: include or exclude specific path prefixes
- Automatic noise removal: skips assets, login pages, feeds, admin paths, and fragment URLs
- Slug collision prevention: unique filenames guaranteed even when two URLs map to the same slug
- Related page links: each page file ends with a `## Related Pages` section pointing to pages it links to
- Cross-platform path handling: Git Bash path expansion on Windows is normalised automatically

---

## Quick Start

```bash
# Fetch a single page
npx webb2md https://example.com

# Crawl an entire site
npx webb2md https://docs.example.com --crawl

# Crawl with RAG chunks
npx webb2md https://docs.example.com --crawl --chunks

# Crawl a specific section only
npx webb2md https://docs.example.com --crawl --include /guides --max-pages 100
```

---

## Output Structure

```
output/
└── docs.example.com/
    ├── index.md           # human-readable table of all pages with word counts and depth
    ├── sitemap.json       # machine-readable page graph with links between slugs
    ├── metadata.json      # full crawl stats: duration, attempted, succeeded, failed URLs
    ├── pages/
    │   ├── getting-started.md
    │   ├── api-reference.md
    │   └── ...
    └── chunks/            # only when --chunks is passed
        ├── getting-started/
        │   ├── chunk-001.md
        │   ├── chunk-002.md
        │   └── ...
        └── ...
```

Each chunk file has YAML frontmatter:

```yaml
---
source: "https://docs.example.com/getting-started"
title: "Getting Started"
page: "pages/getting-started.md"
chunk: 1
total: 4
section: "Installation"
---
```

---

## CLI Reference

| Flag | Default | Description |
|---|---|---|
| `--crawl` | off | Follow internal links instead of fetching only the seed URL |
| `--depth <n>` | `3` | Maximum link depth from the seed URL |
| `--max-pages <n>` | `50` | Hard cap on total pages crawled |
| `--include <path>` | — | Only crawl URLs whose path starts with this prefix. Repeatable. |
| `--exclude <path>` | — | Skip URLs whose path starts with this prefix. Repeatable. |
| `--chunks` | off | Write RAG-ready chunk files under `chunks/` |

---

## Tech Stack

| Library | Role |
|---|---|
| `axios` | HTTP fetching |
| `cheerio` | Link extraction from raw HTML |
| `jsdom` + `@mozilla/readability` | Article content extraction |
| `turndown` | HTML-to-Markdown conversion |
| `commander` | CLI argument parsing |
| `typescript` + `tsx` | Language and dev runtime |

---

## Project Layout

```
src/
├── index.ts
├── cli/         cli.ts
├── crawler/     SiteCrawler.ts  CrawlQueue.ts  PageRegistry.ts  UrlFilter.ts
├── parser/      readability.ts  htmlParser.ts  markdown.ts
├── exporters/   pageWriter.ts   chunkWriter.ts  siteIndexWriter.ts  markdownExport.ts  jsonExport.ts
└── utils/       fetch.ts  slugify.ts  url.ts
```

---

## License

ISC
