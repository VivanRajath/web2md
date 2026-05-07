import fs from "fs";
import path from "path";
import { PageRegistry, PageRecord } from "../crawler/PageRegistry.js";

function buildRelatedSection(page: PageRecord, registry: PageRegistry): string {
  const related: PageRecord[] = [];

  for (const url of page.outboundUrls) {
    const record = registry.get(url);
    if (record && record.url !== page.url) {
      related.push(record);
    }
  }

  if (related.length === 0) return "";

  const links = related
    .map((r) => `- [${r.title}](./${r.filename})`)
    .join("\n");

  return `\n\n## Related Pages\n\n${links}`;
}

export function writePages(registry: PageRegistry, outputDir: string): void {
  const pagesDir = path.join(outputDir, "pages");
  fs.mkdirSync(pagesDir, { recursive: true });

  for (const page of registry.getAll()) {
    const related = buildRelatedSection(page, registry);
    const content = `# ${page.title}\n\n${page.markdownContent}${related}`;
    const filePath = path.join(pagesDir, page.filename);
    fs.writeFileSync(filePath, content, "utf-8");
  }

  console.log(`Wrote ${registry.size()} pages to ${pagesDir}`);
}
