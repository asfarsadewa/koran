export const SITE_URL = "https://koran.r3ptil.com/";
export const KEMARIN_PATH = "/kemarin";
export const KEMARIN_SITE_URL = new URL(KEMARIN_PATH, SITE_URL).toString();
export const SOCIAL_IMAGE_PATH = "/social/juara-merdeka-social.png";
export const SOCIAL_IMAGE_URL = new URL(SOCIAL_IMAGE_PATH, SITE_URL).toString();
export const SOCIAL_TITLE = "Juara Merdeka — Harian Ikhtisar Dunia";
export const SOCIAL_DESCRIPTION =
  "Lembar ikhtisar dunia yang terbit setiap pagi pukul 07.00 WITA; memuat kabar perang, bencana, kelaparan, pertikaian, serta malapetaka kemanusiaan, disertai rujukan langsung kepada penerbit asal.";
export const KEMARIN_SOCIAL_TITLE = "Juara Merdeka — Lembar Kemarin";
export const KEMARIN_SOCIAL_DESCRIPTION =
  "Lembar ikhtisar dunia untuk hari yang sama tiga puluh lima tahun yang lalu; memuat kabar perang, bencana, kelaparan, pertikaian, serta malapetaka kemanusiaan, disertai rujukan kepada arsip dan penerbit asal.";
export const SOCIAL_IMAGE_ALT =
  "Kepala surat kabar Juara Merdeka, tercetak hitam-putih menurut langgam dasawarsa 1980-an.";

export function isKemarinPath(pathname: string): boolean {
  return pathname === KEMARIN_PATH || pathname === `${KEMARIN_PATH}/`;
}
