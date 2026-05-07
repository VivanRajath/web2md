import * as cheerio from "cheerio";

export function extractContent(html: string): string {
  const $ = cheerio.load(html);

  // Remove useless elements
  $("script").remove();
  $("style").remove();
  $("nav").remove();
  $("footer").remove();
  $("header").remove();
  $("noscript").remove();
  $("svg").remove();
  $("img").remove();

  // Get cleaned body
  return $("body").html() || "";
}