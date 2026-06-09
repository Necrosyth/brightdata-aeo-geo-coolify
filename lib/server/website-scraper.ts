/**
 * Web scraper for Hypotenuse Analytics website
 * Scrapes home page and FAQ pages to extract content
 */

export interface ScrapedContent {
  url: string;
  sectionName: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}

/**
 * Scrape website content using cheerio-like parsing
 * Falls back to basic text extraction if parsing fails
 */
export async function scrapeWebsiteContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    return html;
  } catch (error) {
    console.error(`Failed to scrape ${url}:`, error);
    throw error;
  }
}

/**
 * Extract text content from HTML using simple DOM parsing
 */
export function extractTextFromHtml(html: string): string {
  // Remove script and style tags
  let text = html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    "",
  );
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');

  // Clean up whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

/**
 * Extract sections from HTML content
 */
export function extractSections(html: string, url: string): ScrapedContent[] {
  const sections: ScrapedContent[] = [];

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const pageTitle = titleMatch ? titleMatch[1].trim() : "Untitled";

  // Extract h1, h2 sections
  const headingRegex = /<h[1-2][^>]*>([^<]+)<\/h[1-2]>/gi;
  const headings = Array.from(html.matchAll(headingRegex));

  if (headings.length === 0) {
    // No headings found, treat entire page as one section
    const content = extractTextFromHtml(html).substring(0, 5000);
    sections.push({
      url,
      sectionName: "main-content",
      title: pageTitle,
      content,
      metadata: { type: "full-page" },
    });
  } else {
    // Extract content between headings
    headings.forEach((match, index) => {
      const heading = match[1].trim();
      const startIndex = match.index! + match[0].length;

      // Find next heading or end of document
      const nextMatch = headings[index + 1];
      const endIndex = nextMatch ? nextMatch.index : html.length;

      const sectionHtml = html.substring(startIndex, endIndex);
      const content = extractTextFromHtml(sectionHtml).substring(0, 5000);

      sections.push({
        url,
        sectionName: heading
          .toLowerCase()
          .replace(/\s+/g, "-")
          .substring(0, 50),
        title: heading,
        content,
        metadata: { type: "heading-section" },
      });
    });
  }

  return sections;
}

/**
 * Scrape and parse website content
 */
export async function parseWebsiteContent(
  url: string,
): Promise<ScrapedContent[]> {
  try {
    const html = await scrapeWebsiteContent(url);
    const sections = extractSections(html, url);
    return sections;
  } catch (error) {
    console.error(`Failed to parse website content from ${url}:`, error);
    throw error;
  }
}
