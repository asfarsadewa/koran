export const SHARE_SITE_URL: string;
export const HARI_INI_SHEET: "hari_ini";
export const KEMARIN_SHEET: "kemarin";

export function buildEditionShareUrl(
  editionDate: string,
  articleRank: number,
  locale?: string,
  siteUrl?: string,
  sheet?: string,
): string;

export function buildStoryShareData(
  headline: string,
  editionDate: string,
  articleRank: number,
  locale?: string,
  siteUrl?: string,
  sheet?: string,
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
  sheet?: string;
}): Promise<Blob>;
