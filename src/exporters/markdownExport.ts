import fs from "fs";
import path from "path";

export function saveMarkdown(content: string, filename = "output.md") {
  const outputDir = "output";

  // Create output folder if missing
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  const filePath = path.join(outputDir, filename);

  fs.writeFileSync(filePath, content);

  console.log(`Saved markdown to ${filePath}`);
}