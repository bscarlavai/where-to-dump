/**
 * Reads all MDX files from src/content/guides/ and generates a TypeScript
 * registry file with pre-compiled HTML. This runs before next build.
 *
 * Handles custom components:
 *   <AffiliateLink href="...">text</AffiliateLink> → <a> with rel="nofollow sponsored noopener"
 *   [text](/) → internal links (kept as-is for Next.js)
 */
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const GUIDES_DIR = path.join(process.cwd(), 'src/content/guides');
const OUTPUT = path.join(process.cwd(), 'src/lib/guide-registry.generated.ts');

/**
 * Convert AffiliateLink components to plain HTML anchor tags
 */
function processAffiliateLinks(content: string): string {
  return content.replace(
    /<AffiliateLink\s+href="([^"]+)">([\s\S]*?)<\/AffiliateLink>/g,
    '<a href="$1" target="_blank" rel="nofollow sponsored noopener" class="affiliate-link">$2</a>'
  );
}

/**
 * Simple markdown to HTML conversion for the subset we use in guides.
 * Handles: headings, paragraphs, bold, italic, links, lists, hrs, blockquotes.
 */
function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const html: string[] = [];
  let inList = false;
  let listType: 'ul' | 'ol' = 'ul';

  function processInline(text: string): string {
    // Bold + italic
    text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    // Bold
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Links
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, href) => {
      const isInternal = href.startsWith('/') || href.startsWith('https://gofarmhop.com');
      if (isInternal) {
        return `<a href="${href}">${linkText}</a>`;
      }
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
    });
    return text;
  }

  function closeList() {
    if (inList) {
      html.push(`</${listType}>`);
      inList = false;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      closeList();
      html.push('<hr>');
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${processInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Unordered list items
    if (/^[-*]\s+/.test(line.trim())) {
      if (!inList || listType !== 'ul') {
        closeList();
        html.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      html.push(`<li>${processInline(line.trim().replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }

    // Ordered list items
    const olMatch = line.trim().match(/^(\d+)\.\s+(.+)$/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        closeList();
        html.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      html.push(`<li>${processInline(olMatch[2])}</li>`);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      closeList();
      continue;
    }

    // Regular paragraph
    closeList();
    html.push(`<p>${processInline(line)}</p>`);
  }

  closeList();
  return html.join('\n');
}

const files = fs.readdirSync(GUIDES_DIR).filter((f) => f.endsWith('.mdx'));

const entries = files.map((filename) => {
  const slug = filename.replace(/\.mdx$/, '');
  const raw = fs.readFileSync(path.join(GUIDES_DIR, filename), 'utf-8');
  const { data, content } = matter(raw);

  // Process AffiliateLink components first, then convert markdown to HTML
  const processed = processAffiliateLinks(content);
  const html = markdownToHtml(processed);

  return {
    slug,
    frontmatter: data,
    content: raw,  // Keep raw content for AffiliateLink detection
    html,
  };
});

entries.sort(
  (a, b) =>
    new Date(b.frontmatter.publishedAt).getTime() -
    new Date(a.frontmatter.publishedAt).getTime()
);

const output = `// AUTO-GENERATED — do not edit. Run "npm run generate:guides" to rebuild.
import type { GuideFrontmatter } from './guides';

interface GuideRecord {
  slug: string;
  frontmatter: GuideFrontmatter;
  content: string;
  html: string;
}

export const guides: GuideRecord[] = ${JSON.stringify(entries, null, 2)};
`;

fs.writeFileSync(OUTPUT, output, 'utf-8');
console.log(`Generated guide registry with ${entries.length} guides → ${OUTPUT}`);
