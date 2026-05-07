export function urlToSlug(url: string): string {
  const parsed = new URL(url);
  const pathname = parsed.pathname;

  const slug = pathname
    .replace(/\/+$/g, "")       // trailing slashes
    .replace(/^\/+/g, "")       // leading slashes
    .replace(/\//g, "-")        // path separators → dashes
    .replace(/[^\w-]/g, "-")    // non-word chars → dashes
    .replace(/-+/g, "-")        // collapse multiple dashes
    .toLowerCase();

  return slug || "index";
}

export function makeUniqueSlug(baseSlug: string, usedSlugs: Set<string>): string {
  if (!usedSlugs.has(baseSlug)) return baseSlug;

  let counter = 2;
  while (usedSlugs.has(`${baseSlug}-${counter}`)) {
    counter++;
  }
  return `${baseSlug}-${counter}`;
}
