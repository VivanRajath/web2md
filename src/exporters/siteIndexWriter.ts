import fs from "fs";
import path from "path";
import { PageRegistry } from "../crawler/PageRegistry.js";
import { CrawlStats } from "../crawler/SiteCrawler.js";

function readingTime(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / 200));
}

export function writeSiteIndex(
  registry: PageRegistry,
  outputDir: string,
  stats: CrawlStats
): void {
  const pages = registry.getAll().sort((a, b) => a.depth - b.depth || a.slug.localeCompare(b.slug));

  // index.md
  const lines: string[] = [
    `# Site Index`,
    ``,
    `**Source:** ${stats.seedUrl}`,
    `**Crawled:** ${stats.crawledAt}`,
    `**Pages:** ${pages.length} | **Words:** ${stats.totalWords.toLocaleString()} | **Duration:** ${(stats.durationMs / 1000).toFixed(1)}s`,
    ``,
    `## Pages`,
    ``,
    `| Page | Words | Read | Depth | URL |`,
    `|------|-------|------|-------|-----|`,
  ];

  for (const page of pages) {
    const rt = readingTime(page.wordCount);
    lines.push(
      `| [${page.title}](./pages/${page.filename}) | ${page.wordCount} | ${rt} min | ${page.depth} | \`${page.url}\` |`
    );
  }

  if (stats.failedUrls.length > 0) {
    lines.push(``, `## Failed URLs`, ``);
    for (const url of stats.failedUrls) {
      lines.push(`- ${url}`);
    }
  }

  fs.writeFileSync(path.join(outputDir, "index.md"), lines.join("\n"), "utf-8");

  // sitemap.json
  const sitemap = pages.map((p) => ({
    url: p.url,
    slug: p.slug,
    filename: `pages/${p.filename}`,
    title: p.title,
    depth: p.depth,
    wordCount: p.wordCount,
    readingTimeMin: readingTime(p.wordCount),
    linksTo: p.outboundUrls
      .map((u) => registry.get(u)?.filename)
      .filter(Boolean)
      .map((f) => `pages/${f}`),
  }));

  fs.writeFileSync(
    path.join(outputDir, "sitemap.json"),
    JSON.stringify(sitemap, null, 2),
    "utf-8"
  );

  // metadata.json
  fs.writeFileSync(
    path.join(outputDir, "metadata.json"),
    JSON.stringify(stats, null, 2),
    "utf-8"
  );

  console.log(`Wrote index.md, sitemap.json, metadata.json to ${outputDir}`);
}
