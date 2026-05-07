import fs from "fs";
import path from "path";
import { PageRegistry, PageRecord } from "../crawler/PageRegistry.js";

interface Chunk {
  heading: string;
  content: string;
}

function splitIntoChunks(markdown: string): Chunk[] {
  const lines = markdown.split("\n");
  const chunks: Chunk[] = [];

  let currentHeading = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      const accumulated = currentLines.join("\n").trim();
      if (accumulated) {
        chunks.push({ heading: currentHeading, content: accumulated });
      }
      currentHeading = line.replace(/^## /, "").trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  const last = currentLines.join("\n").trim();
  if (last) {
    chunks.push({ heading: currentHeading, content: last });
  }

  return chunks;
}

function buildFrontmatter(page: PageRecord, chunk: Chunk, index: number, total: number): string {
  const lines = [
    "---",
    `source: "${page.url}"`,
    `title: "${page.title.replace(/"/g, '\\"')}"`,
    `page: "pages/${page.filename}"`,
    `chunk: ${index}`,
    `total: ${total}`,
  ];

  if (chunk.heading) {
    lines.push(`section: "${chunk.heading.replace(/"/g, '\\"')}"`);
  }

  lines.push("---");
  return lines.join("\n");
}

export function writeChunks(registry: PageRegistry, outputDir: string): number {
  const chunksDir = path.join(outputDir, "chunks");
  let totalChunks = 0;

  for (const page of registry.getAll()) {
    const chunks = splitIntoChunks(page.markdownContent);
    if (chunks.length === 0) continue;

    const pageChunksDir = path.join(chunksDir, page.slug);
    fs.mkdirSync(pageChunksDir, { recursive: true });

    chunks.forEach((chunk, i) => {
      const num = String(i + 1).padStart(3, "0");
      const frontmatter = buildFrontmatter(page, chunk, i + 1, chunks.length);
      const fileContent = `${frontmatter}\n\n${chunk.content}`;
      fs.writeFileSync(path.join(pageChunksDir, `chunk-${num}.md`), fileContent, "utf-8");
      totalChunks++;
    });
  }

  console.log(`Wrote ${totalChunks} chunks to ${chunksDir}`);
  return totalChunks;
}
