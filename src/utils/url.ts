export function generateFileName(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/[^\w]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase() + ".md";
}