export const SHARE_SITE_URL = "https://koran.r3ptil.com/";

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;
const PAPER = "#e9e8e1";
const PAPER_BRIGHT = "#f4f3ed";
const INK = "#11110f";
const INK_SOFT = "#3a3a36";
const INDONESIAN_LOCALE = "id";
const CHINESE_LOCALE = "zh-Hans";

export function buildEditionShareUrl(
  editionDate,
  articleRank,
  locale = INDONESIAN_LOCALE,
  siteUrl = SHARE_SITE_URL,
) {
  const url = new URL("/", siteUrl);
  url.searchParams.set("edisi", editionDate);
  if (locale === CHINESE_LOCALE) url.searchParams.set("bahasa", CHINESE_LOCALE);
  url.hash = `berita-${articleRank}`;
  return url.href;
}

export function buildStoryShareData(
  headline,
  editionDate,
  articleRank,
  locale = INDONESIAN_LOCALE,
  siteUrl = SHARE_SITE_URL,
) {
  const url = buildEditionShareUrl(editionDate, articleRank, locale, siteUrl);
  return {
    title: headline,
    text:
      locale === CHINESE_LOCALE
        ? `${headline}\n\n在《自由冠军报》阅读这则剪报。`
        : `${headline}\n\nBaca kliping ini di Juara Merdeka.`,
    url,
  };
}

export function storyShareFileName(editionDate, articleRank) {
  return `juara-merdeka-${editionDate}-berita-${articleRank}.png`;
}

function hashText(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let value = seed || 1;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function utilityFont(size, weight = 800) {
  return `${weight} ${size}px "Roboto Condensed JM", "Arial Narrow", sans-serif`;
}

function storyFont(size, weight = 650, locale = INDONESIAN_LOCALE, style = "normal") {
  const family =
    locale === CHINESE_LOCALE
      ? '"Songti SC", "Noto Serif CJK SC", SimSun, serif'
      : '"Newsreader JM", Georgia, serif';
  return `${style} ${weight} ${size}px ${family}`;
}

function mastheadFont(locale) {
  return locale === CHINESE_LOCALE
    ? storyFont(69, 800, locale)
    : '400 70px "Archivo Black JM", Impact, sans-serif';
}

function usesCharacterWrapping(text, locale) {
  return locale === CHINESE_LOCALE || /\p{Script=Han}/u.test(text);
}

function textTokens(text, locale) {
  return usesCharacterWrapping(text, locale)
    ? Array.from(text.trim())
    : text.trim().split(/\s+/u);
}

function wrapText(context, text, maxWidth, locale, maxLines = Number.POSITIVE_INFINITY) {
  const characterWrapping = usesCharacterWrapping(text, locale);
  const separator = characterWrapping ? "" : " ";
  const tokens = textTokens(text, locale);
  const lines = [];
  let current = "";

  for (const token of tokens) {
    const candidate = current ? `${current}${separator}${token}` : token;
    if (!current || context.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = token;
  }
  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  let last = visible.at(-1) ?? "";
  while (last && context.measureText(`${last}…`).width > maxWidth) {
    last = characterWrapping
      ? Array.from(last).slice(0, -1).join("")
      : last.split(/\s+/u).slice(0, -1).join(" ");
  }
  visible[visible.length - 1] = `${last}…`;
  return visible;
}

function fitHeadline(context, headline, locale, maxWidth, preserveImageSpace) {
  const maximum = locale === CHINESE_LOCALE ? 94 : 104;
  const minimum = locale === CHINESE_LOCALE ? 62 : 58;
  const lineLimit = preserveImageSpace ? 4 : 5;
  const heightLimit = preserveImageSpace ? 345 : 420;
  for (let size = maximum; size >= minimum; size -= 2) {
    context.font = storyFont(size, 760, locale);
    const lines = wrapText(context, headline, maxWidth, locale);
    const lineHeight = size * (locale === CHINESE_LOCALE ? 1.08 : 0.89);
    if (lines.length <= lineLimit && lines.length * lineHeight <= heightLimit) {
      return { size, lineHeight, lines };
    }
  }
  context.font = storyFont(minimum, 760, locale);
  return {
    size: minimum,
    lineHeight: minimum * (locale === CHINESE_LOCALE ? 1.08 : 0.89),
    lines: wrapText(context, headline, maxWidth, locale, 6),
  };
}

function drawLines(context, lines, x, top, lineHeight) {
  lines.forEach((line, index) => context.fillText(line, x, top + index * lineHeight));
  return top + lines.length * lineHeight;
}

function drawRule(context, y, width = 1, start = 70, end = CARD_WIDTH - 70) {
  context.fillStyle = INK;
  context.fillRect(start, Math.round(y), end - start, width);
}

function drawPaper(context, seed) {
  context.fillStyle = PAPER;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  context.fillStyle = "rgba(17, 17, 15, 0.022)";
  context.fillRect(228, 0, 3, CARD_HEIGHT);

  const random = seededRandom(seed);
  for (let index = 0; index < 1850; index += 1) {
    const alpha = 0.025 + random() * 0.065;
    const size = random() > 0.92 ? 1.5 : 0.75;
    context.fillStyle = `rgba(17, 17, 15, ${alpha})`;
    context.fillRect(random() * CARD_WIDTH, random() * CARD_HEIGHT, size, size);
  }
}

function editionDateLabel(editionDate, locale) {
  const date = new Date(`${editionDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return editionDate;
  return new Intl.DateTimeFormat(locale === CHINESE_LOCALE ? "zh-CN" : "id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

async function loadStoryImage(url) {
  if (!url || typeof Image === "undefined") return null;
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.referrerPolicy = "no-referrer";
  image.decoding = "async";

  const loaded = new Promise((resolve) => {
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => resolve(null), { once: true });
  });
  image.src = url;
  return Promise.race([
    loaded,
    new Promise((resolve) => window.setTimeout(() => resolve(null), 2200)),
  ]);
}

function drawStoryImage(context, image, x, y, width, height) {
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;
  if (sourceRatio > targetRatio) {
    sourceWidth = sourceHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = sourceWidth / targetRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }

  context.save();
  context.filter = "grayscale(1) contrast(1.45) brightness(0.93)";
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
  context.filter = "none";
  context.globalAlpha = 0.24;
  context.fillStyle = INK;
  for (let dotY = y + 2; dotY < y + height; dotY += 6) {
    for (let dotX = x + 2; dotX < x + width; dotX += 6) {
      context.beginPath();
      context.arc(dotX, dotY, 1.05, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
  drawRule(context, y, 3, x, x + width);
  drawRule(context, y + height - 3, 3, x, x + width);
}

async function waitForPrintFonts() {
  if (!document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load('400 70px "Archivo Black JM"'),
      document.fonts.load('760 94px "Newsreader JM"'),
      document.fonts.load('800 24px "Roboto Condensed JM"'),
      document.fonts.ready,
    ]);
  } catch {
    // System fallbacks retain the newspaper hierarchy when a font cannot be loaded.
  }
}

export async function renderStoryClipping({ article, editionDate, issueNumber, locale }) {
  await waitForPrintFonts();
  const image = await loadStoryImage(article.imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("canvas-unavailable");

  const resolvedLocale = locale === CHINESE_LOCALE ? CHINESE_LOCALE : INDONESIAN_LOCALE;
  const dateLabel = editionDateLabel(editionDate, resolvedLocale);
  drawPaper(context, hashText(`${editionDate}:${article.rank}:${article.headline}`));
  context.textBaseline = "top";
  context.fillStyle = INK;

  drawRule(context, 54, 3);
  context.font = utilityFont(20, 820);
  context.letterSpacing = "2px";
  context.fillText(
    resolvedLocale === CHINESE_LOCALE ? "世界新闻摘要日报" : "HARIAN IKHTISAR DUNIA",
    72,
    72,
  );
  context.textAlign = "right";
  context.fillText(
    resolvedLocale === CHINESE_LOCALE
      ? `第 ${String(issueNumber).padStart(4, "0")} 期 · ${dateLabel}`
      : `NOMOR ${String(issueNumber).padStart(4, "0")} · ${dateLabel.toUpperCase()}`,
    CARD_WIDTH - 72,
    72,
  );
  context.textAlign = "left";
  context.letterSpacing = "0px";
  context.font = mastheadFont(resolvedLocale);
  context.fillText(resolvedLocale === CHINESE_LOCALE ? "自由冠军报" : "JUARA MERDEKA", 70, 105);
  drawRule(context, 184, 8);

  const sectionLabel = String(article.sectionLabel ?? article.section ?? "Dunia");
  context.font = utilityFont(23, 850);
  context.letterSpacing = "3px";
  context.fillText(sectionLabel.toUpperCase(), 104, 216);
  context.letterSpacing = "0px";
  context.fillRect(70, 224, 22, 7);

  const headline = fitHeadline(
    context,
    article.headline,
    resolvedLocale,
    CARD_WIDTH - 140,
    Boolean(image),
  );
  context.font = storyFont(headline.size, 760, resolvedLocale);
  const headlineBottom = drawLines(context, headline.lines, 70, 260, headline.lineHeight);

  let cursor = headlineBottom + 22;
  if (image && cursor < 720) {
    const imageHeight = Math.min(285, 845 - cursor);
    if (imageHeight >= 190) {
      drawStoryImage(context, image, 70, cursor, CARD_WIDTH - 140, imageHeight);
      cursor += imageHeight + 25;
    }
  }

  const bodyLimit = 1115;
  const deckSize = resolvedLocale === CHINESE_LOCALE ? 30 : 32;
  const deckLineHeight = resolvedLocale === CHINESE_LOCALE ? 43 : 38;
  const impactReserve = 145;
  const deckLineLimit = Math.max(
    2,
    Math.min(image ? 4 : 6, Math.floor((bodyLimit - cursor - impactReserve) / deckLineHeight)),
  );
  context.fillStyle = INK;
  context.font = storyFont(deckSize, 510, resolvedLocale);
  const deckLines = wrapText(context, article.dek, CARD_WIDTH - 140, resolvedLocale, deckLineLimit);
  cursor = drawLines(context, deckLines, 70, cursor, deckLineHeight) + 20;

  const impactTop = cursor;
  context.fillRect(70, impactTop, 7, Math.max(82, bodyLimit - impactTop));
  context.font = utilityFont(19, 850);
  context.letterSpacing = "2px";
  context.fillText(
    resolvedLocale === CHINESE_LOCALE ? "对人的影响" : "DAMPAK MANUSIA",
    96,
    impactTop + 2,
  );
  context.letterSpacing = "0px";
  context.font = storyFont(26, 520, resolvedLocale, "italic");
  const impactLineLimit = Math.max(2, Math.floor((bodyLimit - impactTop - 35) / 32));
  const impactLines = wrapText(
    context,
    article.impact,
    CARD_WIDTH - 172,
    resolvedLocale,
    impactLineLimit,
  );
  drawLines(context, impactLines, 96, impactTop + 36, 32);

  drawRule(context, 1147, 2);
  context.fillStyle = INK_SOFT;
  context.font = utilityFont(20, 760);
  const sourceLabel = resolvedLocale === CHINESE_LOCALE ? "原文来源" : "SUMBER ASLI";
  context.fillText(`${sourceLabel} · ${article.sourceName}`, 70, 1166);
  context.textAlign = "right";
  context.fillText(`${dateLabel} · BERITA ${String(article.rank).padStart(2, "0")}`, CARD_WIDTH - 70, 1166);
  context.textAlign = "left";

  context.fillStyle = INK;
  context.fillRect(0, 1222, CARD_WIDTH, CARD_HEIGHT - 1222);
  context.fillStyle = PAPER_BRIGHT;
  context.font = utilityFont(42, 880);
  context.letterSpacing = "2px";
  context.fillText("KORAN.R3PTIL.COM", 70, 1242);
  context.font = utilityFont(16, 760);
  context.fillText(
    resolvedLocale === CHINESE_LOCALE ? "在报纸上阅读摘要与原文链接" : "BACA IKHTISAR DAN TAUTAN SUMBER DI KORAN",
    72,
    1303,
  );
  context.letterSpacing = "0px";

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("image-encoding-failed");
  return blob;
}
