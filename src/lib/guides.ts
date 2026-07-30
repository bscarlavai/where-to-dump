import { guides } from './guide-registry.generated';

export interface GuideFrontmatter {
  title: string;
  description: string;
  publishedAt: string;
  updatedAt?: string;
  image?: string;
  imageAlt?: string;
}

export interface GuideEntry {
  slug: string;
  frontmatter: GuideFrontmatter;
}

export interface Guide extends GuideEntry {
  content: string;
  html: string;
}

export function getAllGuides(): GuideEntry[] {
  return guides.map(({ slug, frontmatter }) => ({ slug, frontmatter }));
}

export function getGuideBySlug(slug: string): Guide | null {
  return guides.find((g) => g.slug === slug) ?? null;
}

export function getAllGuideSlugs(): string[] {
  return guides.map((g) => g.slug);
}
