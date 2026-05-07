import fs from "fs";
import path from "path";

export function saveJSON(data: unknown, filename = "output.json") {
  const outputDir = "output";

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  const filePath = path.join(outputDir, filename);

  fs.writeFileSync(
    filePath,
    JSON.stringify(data, null, 2)
  );

  console.log(`Saved JSON to ${filePath}`);
}