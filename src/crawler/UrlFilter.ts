const BLOCKED_EXTENSIONS = new Set([
  ".pdf", ".zip", ".png", ".jpg", ".jpeg", ".gif", ".svg",
  ".mp4", ".mp3", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".css", ".js"
]);

const BLOCKED_PATH_SEGMENTS = [
  "/login", "/logout", "/signup", "/sign-up", "/register",
  "/auth", "/oauth", "/search", "/cdn-cgi", "/wp-admin",
  "/wp-login", "/cart", "/checkout", "/account", "/profile",
  "/feed", "/rss", "/sitemap"
];

// Accepts "docs", "/docs", or a Git Bash-expanded Windows path like
// "C:/Program Files/Git/docs" and always returns a lowercase pathname prefix
// starting with "/".
function normalizePathPrefix(raw: string): string {
  let cleaned = raw.replace(/\\/g, "/");

  // Git Bash expands /foo to C:/Program Files/Git/foo (or similar root).
  // Recover the original path by stripping everything up to and including
  // a known Git/MSYS installation directory name.
  const gitRootMatch = cleaned.match(/(?:\/Git|\/msys64|\/cygwin64|\/MinGW)(\/.*)/i);
  if (gitRootMatch) {
    cleaned = gitRootMatch[1];
  } else if (/^[A-Za-z]:/.test(cleaned)) {
    // Generic Windows absolute path fallback: strip drive + first directory
    cleaned = cleaned.replace(/^[A-Za-z]:[/][^/]+/, "");
  }

  return (cleaned.startsWith("/") ? cleaned : `/${cleaned}`).toLowerCase();
}

export interface UrlFilterOptions {
  include?: string[];  // only allow URLs whose pathname starts with one of these
  exclude?: string[];  // block URLs whose pathname starts with one of these
}

export class UrlFilter {
  private hostname: string;
  private include: string[];
  private exclude: string[];

  constructor(seedUrl: string, options: UrlFilterOptions = {}) {
    this.hostname = new URL(seedUrl).hostname;
    this.include = (options.include ?? []).map(normalizePathPrefix);
    this.exclude = (options.exclude ?? []).map(normalizePathPrefix);
  }

  allow(url: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }

    if (parsed.hostname !== this.hostname) return false;
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (parsed.hash) return false;

    const pathname = parsed.pathname.toLowerCase();

    const ext = pathname.match(/\.[a-z0-9]+$/)?.[0];
    if (ext && BLOCKED_EXTENSIONS.has(ext)) return false;

    for (const segment of BLOCKED_PATH_SEGMENTS) {
      if (pathname.includes(segment)) return false;
    }

    if (this.include.length > 0) {
      const allowed = this.include.some((p) => pathname.startsWith(p.toLowerCase()));
      if (!allowed) return false;
    }

    for (const p of this.exclude) {
      if (pathname.startsWith(p.toLowerCase())) return false;
    }

    return true;
  }

  normalize(url: string): string {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    }
    return parsed.toString();
  }
}
