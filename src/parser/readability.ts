import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export function extractReadableContent(html: string, url: string) {
  const dom = new JSDOM(html, { url });

  const reader = new Readability(dom.window.document);

  const article = reader.parse();

  return {
    title: article?.title || "Untitled",
    content: article?.content || ""
  };
}