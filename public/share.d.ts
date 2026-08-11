export const SHARE_SITE_URL: string;

export function buildEditionShareUrl(
  editionDate: string,
  articleRank: number,
  locale?: string,
  siteUrl?: string,
): string;

export function buildStoryShareData(
  headline: string,
  editionDate: string,
  articleRank: number,
  locale?: string,
  siteUrl?: string,
): { title: string; text: string; url: string };

export function storyShareFileName(editionDate: string, articleRank: number): string;

export function renderStoryClipping(input: {
  article: {
    rank: number;
    section: string;
    sectionLabel?: string;
    headline: string;
    dek: string;
    impact: string;
    sourceName: string;
    imageUrl?: string;
  };
  editionDate: string;
  issueNumber: number;
  locale: string;
}): Promise<Blob>;
