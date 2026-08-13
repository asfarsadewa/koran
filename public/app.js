import {
  CHINESE_LOCALE,
  INDONESIAN_LOCALE,
  formatEditionDate,
  formatSourceDate,
  hasChineseEdition,
  mixLanguageText,
} from "./language.js";
import {
  KEMARIN_SHEET,
  buildStoryShareData,
  renderStoryClipping,
  storyShareFileName,
} from "./share.js";

const staticCopy = {
  "skip-link": { id: "Langsung ke berita utama", zhHans: "直接阅览头版新闻" },
  "top-purpose": { id: "HARIAN IKHTISAR DUNIA", zhHans: "世界新闻摘要日报" },
  "edition-switch": { id: "KEMARIN", zhHans: "昨日" },
  "top-place": { id: "SEMARANG • JAWA TENGAH", zhHans: "三宝垄 • 中爪哇" },
  "top-schedule": { id: "TERBIT PUKUL 07.00 WITA", zhHans: "每日西澳中部标准时间七时出版" },
  "number-label": { id: "NOMOR", zhHans: "期号" },
  "masthead-name": { id: "JUARA MERDEKA", zhHans: "自由冠军报" },
  "masthead-motto": {
    id: "Bebas memandang dunia, teguh mengingat manusia",
    zhHans: "放眼天下，铭记苍生",
  },
  "price-label": { id: "HARGA", zhHans: "售价" },
  "price-value": { id: "KESADARAN", zhHans: "觉悟" },
  "price-note": { id: "TIDAK DIPERJUALBELIKAN", zhHans: "非卖品" },
  "source-note": {
    id: "SUMBER ASLI TERPAUT PADA SETIAP BERITA",
    zhHans: "每则报道均附原始出处",
  },
  "strip-conflict": { id: "PERTIKAIAN", zhHans: "冲突" },
  "strip-disaster": { id: "BENCANA", zhHans: "灾害" },
  "strip-humanitarian": { id: "KEMANUSIAAN", zhHans: "人道危机" },
  "strip-rights": { id: "HAK ASASI", zhHans: "人权" },
  "strip-health": { id: "KESEHATAN", zhHans: "卫生" },
  "strip-climate": { id: "IKLIM", zhHans: "气候" },
  "demo-notice": {
    id: "EDISI PERAGA — NASKAH DI BAWAH INI HANYA DIPAKAI UNTUK MEMERIKSA TATA LETAK",
    zhHans: "样刊——下列文字仅供检验版面之用",
  },
  "intro-label": { id: "POKOK BERITA HARI INI", zhHans: "今日要闻" },
  "kemarin-notice": {
    id: "LEMBAR KEMARIN — HARI YANG SAMA, TIGA PULUH LIMA TAHUN YANG LALU",
    zhHans: "昨日专页——三十五年前之同日",
  },
  "loading-copy": { id: "LEMBAR BERITA SEDANG DIBUKA…", zhHans: "报纸正在展开……" },
  "wire-title": { id: "KAWAT DUNIA", zhHans: "国际电讯" },
  "wire-subtitle": { id: "Laporan singkat dari berbagai tempat", zhHans: "各地简讯" },
  "stamp-top": { id: "DIHIMPUN", zhHans: "汇编" },
  "stamp-middle": { id: "MESIN\nREDAKSI", zhHans: "编辑\n机器" },
  "stamp-time": { id: "07.00 WITA", zhHans: "西澳中部标准时间七时" },
  "empty-label": { id: "KETERANGAN REDAKSI", zhHans: "编辑部启事" },
  "empty-title": { id: "Edisi pertama masih dihimpun.", zhHans: "创刊号仍在汇编之中。" },
  "empty-copy": {
    id: "Mesin redaksi belum menyerahkan susunan berita pagi. Silakan datang kembali setelah pukul 07.00 WITA.",
    zhHans: "编辑机器尚未交付晨报版样，敬请于西澳中部标准时间七时以后再行阅览。",
  },
  "about-title": { id: "TENTANG LEMBAR INI", zhHans: "关于本报" },
  "about-copy": {
    id: "Juara Merdeka memilih kabar berdasarkan dampak kemanusiaan, bukan kegaduhan. Ringkasan tidak menggantikan laporan asli; buka setiap berita untuk membaca sumber penerbitnya.",
    zhHans: "《自由冠军报》依据人道影响而非喧嚣选取新闻。摘要不能代替原始报道；请打开各则新闻查阅出版者原文。",
  },
  "accountability-title": { id: "PERTANGGUNGJAWABAN", zhHans: "编辑责任" },
  "accountability-copy": {
    id: "Pemilihan dan penyusunan bahasa dilakukan oleh GPT-5.6 Sol. Tautan sumber, tanggal, dan akibat peristiwa diperiksa dalam tata kerja redaksi sebelum penerbitan.",
    zhHans: "新闻选取及文字编排由 GPT-5.6 Sol 完成。出处链接、日期与事件后果均按编辑规程于出版前核验。",
  },
  "colophon-mark": { id: "JM", zhHans: "冠" },
  "source-label": { id: "SUMBER", zhHans: "来源" },
  "impact-label": { id: "AKIBAT：", zhHans: "影响：" },
};

const sectionLabels = {
  id: {
    conflict: "Perang & Pertikaian",
    disaster: "Bencana",
    humanitarian: "Kemanusiaan",
    rights: "Hak Asasi",
    health: "Kesehatan",
    climate: "Iklim",
    economy: "Krisis Ekonomi",
  },
  zhHans: {
    conflict: "战争与冲突",
    disaster: "灾害",
    humanitarian: "人道危机",
    rights: "人权",
    health: "卫生",
    climate: "气候",
    economy: "经济危机",
  },
};

const shareCopy = {
  id: {
    button: "BAGIKAN KLIPING",
    buttonLabel: "Bagikan kliping berita",
    printing: "MENCETAK…",
    downloaded: "KLIPING DIUNDUH",
    copied: "TAUTAN KORAN DISALIN",
    ready: "KLIPING SIAP · KETUK LAGI UNTUK MEMBAGIKAN",
    failed: "KLIPING TIDAK DAPAT DICETAK — COBA LAGI",
  },
  zhHans: {
    button: "分享剪报",
    buttonLabel: "分享新闻剪报",
    printing: "正在制版……",
    downloaded: "剪报图片已下载",
    copied: "报纸链接已复制",
    ready: "剪报已就绪，请再次点击分享",
    failed: "无法生成剪报，请重试",
  },
};

const pageParameters = new URLSearchParams(window.location.search);
const isKemarinSheet = window.location.pathname.replace(/\/+$/u, "") === "/kemarin";
const requestedEditionDate = pageParameters.get("edisi");
const requestedLocale =
  pageParameters.get("bahasa") === CHINESE_LOCALE ? CHINESE_LOCALE : INDONESIAN_LOCALE;
const requestedArticleMatch = window.location.hash.match(/^#berita-([1-8])$/u);
const requestedArticleRank = requestedArticleMatch ? Number(requestedArticleMatch[1]) : null;

const elements = {
  newsprint: document.querySelector("#newsprint"),
  sectionStrip: document.querySelector(".section-strip"),
  loading: document.querySelector("#loading-ledger"),
  empty: document.querySelector("#empty-edition"),
  frontGrid: document.querySelector("#front-grid"),
  lead: document.querySelector("#lead-story"),
  wire: document.querySelector("#world-wire-items"),
  storyGrid: document.querySelector("#story-grid"),
  issueNumber: document.querySelector("#issue-number"),
  editionDate: document.querySelector("#edition-date"),
  editionDateShort: document.querySelector("#edition-date-short"),
  curatorLine: document.querySelector("#curator-line"),
  mastheadDek: document.querySelector("#masthead-dek"),
  demoNotice: document.querySelector("#demo-notice"),
  kemarinNotice: document.querySelector("#kemarin-notice"),
  editorialStamp: document.querySelector(".editorial-stamp"),
  editionSwitch: document.querySelector("#edition-switch"),
  languageSwitch: document.querySelector("#language-switch"),
  languageCurrent: document.querySelector("#language-current"),
  languageTarget: document.querySelector("#language-target"),
  shareStatus: document.querySelector("#share-status"),
};

let currentEdition = null;
let currentLocale = requestedLocale;
let languageIsChanging = false;
let shareStatusTimer = 0;
let requestedStoryRevealed = false;
const clippingCache = new Map();
const clippingPreparations = new WeakMap();
const clippingObserver =
  typeof IntersectionObserver === "function"
    ? new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            clippingObserver.unobserve(entry.target);
            clippingPreparations.get(entry.target)?.().catch(() => undefined);
          }
        },
        { rootMargin: "900px 0px" },
      )
    : null;

function make(tag, className, text, copyId) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  if (copyId) element.dataset.copyId = copyId;
  return element;
}

function localeKey(locale) {
  return locale === CHINESE_LOCALE ? "zhHans" : "id";
}

function translatedArticle(edition, article, locale) {
  if (locale !== CHINESE_LOCALE) return article;
  const translated = edition.translations?.zhHans.articles.find(
    (candidate) => candidate.rank === article.rank,
  );
  return translated ? { ...article, ...translated } : article;
}

function storySection(article, locale) {
  const labels = sectionLabels[localeKey(locale)];
  return make(
    "p",
    "story-section",
    labels[article.section] ?? (locale === CHINESE_LOCALE ? "国际" : "Dunia"),
    `article-${article.rank}-section`,
  );
}

function storySource(article, locale) {
  const source = make("div", "story-source");
  source.append(
    make("span", "", staticCopy["source-label"][localeKey(locale)], "source-label"),
    make("strong", "", article.sourceName),
    make(
      "span",
      "",
      formatSourceDate(article.sourcePublishedAt, locale),
      `article-${article.rank}-source-date`,
    ),
    make("span", "source-arrow", "↗"),
  );
  return source;
}

function impactNote(article, locale) {
  const note = make("p", "impact-note");
  note.append(
    make("strong", "", staticCopy["impact-label"][localeKey(locale)], "impact-label"),
    document.createTextNode(" "),
    make("span", "", article.impact, `article-${article.rank}-impact`),
  );
  return note;
}

function storyFigure(article) {
  if (!article.imageUrl) return null;
  const figure = make("figure", "story-figure");
  const image = new Image();
  image.src = article.imageUrl;
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  figure.append(image);
  return figure;
}

function externalLink(article, className, locale) {
  const link = make("a", className);
  link.href = article.sourceUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.dataset.articleRank = String(article.rank);
  link.setAttribute(
    "aria-label",
    locale === CHINESE_LOCALE
      ? `${article.headline}——打开 ${article.sourceName} 原文`
      : `${article.headline} — buka ${article.sourceName}`,
  );
  return link;
}

function showShareStatus(message) {
  window.clearTimeout(shareStatusTimer);
  elements.shareStatus.textContent = message;
  elements.shareStatus.hidden = false;
  shareStatusTimer = window.setTimeout(() => {
    elements.shareStatus.hidden = true;
  }, 4800);
}

function downloadClipping(blob, fileName) {
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}

async function copyShareUrl(url) {
  if (!navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

function clippingKey(article, locale) {
  return currentEdition ? `${currentEdition.id}:${article.rank}:${locale}` : "";
}

function prepareStoryClipping(article, locale) {
  if (!currentEdition) return Promise.reject(new Error("edition-unavailable"));
  const key = clippingKey(article, locale);
  const cached = clippingCache.get(key);
  if (cached instanceof Blob) return Promise.resolve(cached);
  if (cached) return cached;

  const edition = currentEdition;
  const preparation = renderStoryClipping({
    article: {
      ...article,
      imageUrl: clippingImageUrl(article),
      sectionLabel:
        sectionLabels[localeKey(locale)][article.section] ??
        (locale === CHINESE_LOCALE ? "国际" : "Dunia"),
    },
    editionDate: edition.editionDate,
    issueNumber: edition.issueNumber,
    locale,
    sheet: currentSheet(),
  })
    .then((clipping) => {
      clippingCache.set(key, clipping);
      return clipping;
    })
    .catch((error) => {
      clippingCache.delete(key);
      throw error;
    });
  clippingCache.set(key, preparation);
  return preparation;
}

async function shareStory(article, locale, button) {
  if (!currentEdition || button.disabled) return;
  const key = clippingKey(article, locale);
  const labels = shareCopy[localeKey(locale)];
  const originalLabel = labels.button;
  button.disabled = true;
  button.classList.add("is-printing");
  button.textContent = labels.printing;

  try {
    const wasPrepared = clippingCache.get(key) instanceof Blob;
    const clipping = wasPrepared ? clippingCache.get(key) : await prepareStoryClipping(article, locale);
    if (!(clipping instanceof Blob)) throw new Error("clipping-unavailable");

    const fileName = storyShareFileName(currentEdition.editionDate, article.rank);
    const shareData = buildStoryShareData(
      article.headline,
      shareEditionDate(),
      article.rank,
      locale,
      undefined,
      currentSheet(),
    );
    const file =
      typeof File === "function" ? new File([clipping], fileName, { type: "image/png" }) : null;
    let canShareFile = Boolean(file && typeof navigator.share === "function");
    if (canShareFile && typeof navigator.canShare === "function") {
      try {
        canShareFile = navigator.canShare({ files: [file] });
      } catch {
        canShareFile = false;
      }
    }

    if (
      canShareFile &&
      !wasPrepared &&
      navigator.userActivation &&
      !navigator.userActivation.isActive
    ) {
      showShareStatus(labels.ready);
      return;
    }

    if (canShareFile) {
      try {
        await navigator.share({ ...shareData, files: [file] });
        return;
      } catch (error) {
        const errorName =
          error && typeof error === "object" && "name" in error ? String(error.name) : "";
        if (errorName === "AbortError") return;
        if (errorName === "NotAllowedError") {
          showShareStatus(labels.ready);
          return;
        }
      }
    }

    downloadClipping(clipping, fileName);
    const copied = await copyShareUrl(shareData.url);
    showShareStatus(`${labels.downloaded}${copied ? ` · ${labels.copied}` : ""}`);
  } catch (error) {
    console.error("story-share-failed", error);
    showShareStatus(labels.failed);
  } finally {
    button.disabled = false;
    button.classList.remove("is-printing");
    button.textContent = originalLabel;
  }
}

function storyShareButton(article, locale) {
  const labels = shareCopy[localeKey(locale)];
  const button = make("button", "story-share-button", labels.button);
  button.type = "button";
  button.dataset.articleRank = String(article.rank);
  button.setAttribute("aria-label", `${labels.buttonLabel}: ${article.headline}`);
  button.addEventListener("click", () => shareStory(article, locale, button));
  const prepare = () => prepareStoryClipping(article, locale);
  clippingPreparations.set(button, prepare);
  if (clippingObserver) {
    clippingObserver.observe(button);
  } else {
    window.setTimeout(() => prepare().catch(() => undefined), 350);
  }
  return button;
}

function currentSheet() {
  return currentEdition?.kind === KEMARIN_SHEET || isKemarinSheet ? KEMARIN_SHEET : "hari_ini";
}

function shareEditionDate() {
  return currentEdition?.publicationDate ?? currentEdition?.editionDate ?? "";
}

function clippingImageUrl(article) {
  if (!article.imageUrl || !currentEdition) return undefined;
  const url = new URL("/api/article-image", window.location.origin);
  url.searchParams.set("edisi", shareEditionDate());
  url.searchParams.set("berita", String(article.rank));
  if (currentSheet() === KEMARIN_SHEET) url.searchParams.set("jenis", KEMARIN_SHEET);
  return url.href;
}

function updateEditionSwitch() {
  const counterpart = new URL(isKemarinSheet ? "/" : "/kemarin", window.location.origin);
  if (requestedEditionDate) counterpart.searchParams.set("edisi", requestedEditionDate);
  if (currentLocale === CHINESE_LOCALE) counterpart.searchParams.set("bahasa", CHINESE_LOCALE);
  elements.editionSwitch.href = `${counterpart.pathname}${counterpart.search}`;
  elements.editionSwitch.setAttribute("aria-current", isKemarinSheet ? "page" : "false");
  const label =
    currentLocale === CHINESE_LOCALE
      ? isKemarinSheet
        ? "阅读今日专页"
        : "阅读昨日专页"
      : isKemarinSheet
        ? "Buka lembar hari ini"
        : "Buka lembar Kemarin";
  elements.editionSwitch.setAttribute("aria-label", label);
  elements.editionSwitch.title = label;
}

function renderLead(article, locale) {
  const link = externalLink(article, "lead-link", locale);
  link.id = `berita-${article.rank}`;
  const headline = make(
    "h2",
    "lead-headline",
    article.headline,
    `article-${article.rank}-headline`,
  );
  if (article.headline.length > (locale === CHINESE_LOCALE ? 28 : 64)) {
    headline.classList.add("lead-headline--long");
  }
  const deck = make("p", "lead-dek", article.dek, `article-${article.rank}-dek`);
  const figure = storyFigure(article);
  link.append(storySection(article, locale), headline);
  if (figure) link.append(figure);
  link.append(deck, impactNote(article, locale), storySource(article, locale));
  elements.lead.replaceChildren(link, storyShareButton(article, locale));
}

function renderWire(article, locale) {
  const wrapper = make("article", "wire-story");
  wrapper.id = `berita-${article.rank}`;
  const link = externalLink(article, "story-link", locale);
  link.append(
    storySection(article, locale),
    make("h3", "", article.headline, `article-${article.rank}-headline`),
    make("p", "", article.dek, `article-${article.rank}-dek`),
    storySource(article, locale),
  );
  wrapper.append(link, storyShareButton(article, locale));
  return wrapper;
}

function renderCard(article, locale) {
  const wrapper = make("article", "story-card");
  wrapper.id = `berita-${article.rank}`;
  const link = externalLink(article, "story-card__link", locale);
  const heading = make("h2", "", article.headline, `article-${article.rank}-headline`);
  const copy = make("div", "story-card__copy");
  const figure = storyFigure(article);
  if (figure) copy.append(figure);
  copy.append(
    make("p", "story-card__dek", article.dek, `article-${article.rank}-dek`),
    impactNote(article, locale),
    storySource(article, locale),
  );
  link.append(storySection(article, locale), heading, copy);
  wrapper.append(link, storyShareButton(article, locale));
  return wrapper;
}

function buildCopyMap(edition, locale) {
  const key = localeKey(locale);
  const copy = new Map(
    Object.entries(staticCopy).map(([copyId, translations]) => [copyId, translations[key]]),
  );
  const longDate = formatEditionDate(edition.editionDate, locale);
  copy.set("edition-date", locale === CHINESE_LOCALE ? longDate : longDate.toUpperCase());
  copy.set("edition-date-short", locale === CHINESE_LOCALE ? longDate : longDate.toUpperCase());
  copy.set(
    "curator-line",
    locale === CHINESE_LOCALE
      ? `由 ${edition.curatorModel.toUpperCase()} 汇编`
      : `DIHIMPUN ${edition.curatorModel.toUpperCase()}`,
  );
  copy.set(
    "masthead-dek",
    locale === CHINESE_LOCALE
      ? edition.translations.zhHans.mastheadDek
      : edition.mastheadDek,
  );

  if (edition.kind === KEMARIN_SHEET || isKemarinSheet) {
    copy.set(
      "top-purpose",
      locale === CHINESE_LOCALE ? "昨日专页" : "LEMBAR KEMARIN",
    );
    copy.set(
      "intro-label",
      locale === CHINESE_LOCALE ? "昨日要闻" : "POKOK BERITA KEMARIN",
    );
    copy.set("edition-switch", locale === CHINESE_LOCALE ? "今日" : "HARI INI");
    copy.set(
      "empty-title",
      locale === CHINESE_LOCALE ? "昨日专页仍在汇编之中。" : "Lembar Kemarin masih dihimpun.",
    );
    copy.set(
      "empty-copy",
      locale === CHINESE_LOCALE
        ? "编辑机器尚未交付昨日专页。请于西澳中部标准时间七时以后再行阅览。"
        : "Mesin redaksi belum menyerahkan lembar Kemarin. Silakan datang kembali setelah pukul 07.00 WITA.",
    );
    copy.set(
      "about-copy",
      locale === CHINESE_LOCALE
        ? "本页所载为三十五年前同日之人道灾祸摘要，依据当时记载与后来可核验之档案写成。摘要不能代替原始记载；请打开各则新闻查阅出处。"
        : "Lembar ini memuat ikhtisar malapetaka kemanusiaan pada hari yang sama tiga puluh lima tahun lalu, disusun dari catatan sezaman dan arsip yang dapat diperiksa. Ringkasan tidak menggantikan catatan asli; buka setiap berita untuk membaca sumbernya.",
    );
  }

  for (const original of edition.articles) {
    const article = translatedArticle(edition, original, locale);
    copy.set(
      `article-${article.rank}-section`,
      sectionLabels[key][article.section] ?? (locale === CHINESE_LOCALE ? "国际" : "Dunia"),
    );
    copy.set(`article-${article.rank}-headline`, article.headline);
    copy.set(`article-${article.rank}-dek`, article.dek);
    copy.set(`article-${article.rank}-impact`, article.impact);
    copy.set(
      `article-${article.rank}-source-date`,
      formatSourceDate(article.sourcePublishedAt, locale),
    );
  }
  return copy;
}

function applyStaticCopy(copy) {
  for (const element of document.querySelectorAll("[data-copy-id]")) {
    const value = copy.get(element.dataset.copyId);
    if (value !== undefined) element.textContent = value;
  }
}

function updateLanguageSwitch() {
  const chineseAvailable = currentEdition && hasChineseEdition(currentEdition);
  elements.languageSwitch.disabled = !chineseAvailable || languageIsChanging;
  elements.languageSwitch.setAttribute("aria-pressed", String(currentLocale === CHINESE_LOCALE));
  elements.languageSwitch.dataset.locale = currentLocale;
  elements.languageCurrent.textContent =
    currentLocale === CHINESE_LOCALE ? "中文版" : "INDONESIA";
  elements.languageTarget.textContent =
    currentLocale === CHINESE_LOCALE ? "INDONESIA" : chineseAvailable ? "中文版" : "中文版待刊";
  const label = chineseAvailable
    ? currentLocale === CHINESE_LOCALE
      ? "阅读印度尼西亚文版"
      : "Baca versi Tionghoa"
    : "Versi Tionghoa belum tersedia untuk edisi ini";
  elements.languageSwitch.setAttribute("aria-label", label);
  elements.languageSwitch.title = label;
}

function renderEdition(edition, locale = currentLocale) {
  clippingObserver?.disconnect();
  const articles = [...edition.articles].sort((left, right) => left.rank - right.rank);
  if (articles.length !== 8) throw new Error("Susunan edisi tidak lengkap.");
  if (locale === CHINESE_LOCALE && !hasChineseEdition(edition)) {
    locale = INDONESIAN_LOCALE;
  }
  currentLocale = locale;
  document.documentElement.lang = locale;
  const localizedArticles = articles.map((article) => translatedArticle(edition, article, locale));
  const copy = buildCopyMap(edition, locale);

  elements.issueNumber.textContent = String(edition.issueNumber).padStart(4, "0");
  elements.editionDate.dateTime = edition.editionDate;
  elements.demoNotice.hidden = !edition.isDemo;
  elements.kemarinNotice.hidden = edition.kind !== KEMARIN_SHEET && !isKemarinSheet;
  document.documentElement.classList.toggle("is-kemarin", isKemarinSheet);
  document.title = `${localizedArticles[0].headline} — ${
    locale === CHINESE_LOCALE ? "自由冠军报" : "Juara Merdeka"
  }`;
  elements.sectionStrip.setAttribute(
    "aria-label",
    locale === CHINESE_LOCALE ? "报道类别" : "Bidang pemberitaan",
  );
  elements.frontGrid.setAttribute(
    "aria-label",
    locale === CHINESE_LOCALE ? "头版新闻" : "Berita utama",
  );
  elements.storyGrid.setAttribute(
    "aria-label",
    locale === CHINESE_LOCALE ? "其他新闻" : "Berita lainnya",
  );
  elements.editorialStamp.setAttribute(
    "aria-label",
    locale === CHINESE_LOCALE
      ? "由编辑机器于西澳中部标准时间七时汇编"
      : "Dihimpun mesin redaksi pukul tujuh WITA",
  );

  renderLead(localizedArticles[0], locale);
  elements.wire.replaceChildren(...localizedArticles.slice(1, 4).map((article) => renderWire(article, locale)));
  elements.storyGrid.replaceChildren(
    ...localizedArticles.slice(4).map((article) => renderCard(article, locale)),
  );
  applyStaticCopy(copy);
  updateLanguageSwitch();
  updateEditionSwitch();

  elements.loading.hidden = true;
  elements.empty.hidden = true;
  elements.frontGrid.hidden = false;
  elements.storyGrid.hidden = false;

  if (requestedArticleRank && !requestedStoryRevealed) {
    requestedStoryRevealed = true;
    window.requestAnimationFrame(() => {
      const target = document.querySelector(`#berita-${requestedArticleRank}`);
      if (!target) return;
      target.classList.add("is-shared-target");
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
}

function animateLanguageChange(targetLocale) {
  if (!currentEdition || languageIsChanging || targetLocale === currentLocale) return;
  if (targetLocale === CHINESE_LOCALE && !hasChineseEdition(currentEdition)) return;

  const copy = buildCopyMap(currentEdition, targetLocale);
  const targets = [...document.querySelectorAll("[data-copy-id]")]
    .map((element) => ({
      element,
      source: element.textContent ?? "",
      target: copy.get(element.dataset.copyId),
    }))
    .filter((entry) => entry.target !== undefined && entry.source !== entry.target);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion || targets.length === 0) {
    renderEdition(currentEdition, targetLocale);
    return;
  }

  languageIsChanging = true;
  document.documentElement.lang = targetLocale;
  elements.newsprint.classList.add("is-language-shifting");
  elements.newsprint.setAttribute("aria-busy", "true");
  updateLanguageSwitch();
  const startedAt = performance.now();
  const stagger = Math.min(9, 240 / Math.max(targets.length - 1, 1));
  const changeDuration = 720;

  function frame(now) {
    let complete = true;
    targets.forEach((entry, index) => {
      const progress = Math.min(1, Math.max(0, (now - startedAt - index * stagger) / changeDuration));
      entry.element.textContent = mixLanguageText(entry.source, entry.target, progress);
      if (progress < 1) complete = false;
    });
    if (!complete) {
      requestAnimationFrame(frame);
      return;
    }

    languageIsChanging = false;
    elements.newsprint.classList.remove("is-language-shifting");
    elements.newsprint.removeAttribute("aria-busy");
    renderEdition(currentEdition, targetLocale);
    elements.languageSwitch.focus({ preventScroll: true });
  }

  requestAnimationFrame(frame);
}

function showEmpty(message) {
  elements.loading.hidden = true;
  elements.frontGrid.hidden = true;
  elements.storyGrid.hidden = true;
  elements.empty.hidden = false;
  if (message) {
    const paragraph = elements.empty.querySelector("p:last-child");
    paragraph.textContent = message;
  }
  updateLanguageSwitch();
  updateEditionSwitch();
}

async function loadEdition() {
  try {
    const editionEndpoint = new URL("/api/edition", window.location.origin);
    if (isKemarinSheet) editionEndpoint.searchParams.set("jenis", KEMARIN_SHEET);
    if (requestedEditionDate) editionEndpoint.searchParams.set("edisi", requestedEditionDate);
    const response = await fetch(editionEndpoint, {
      headers: { accept: "application/json" },
      credentials: "same-origin",
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok || !payload.edition) {
      showEmpty(payload.error);
      return;
    }
    currentEdition = payload.edition;
    renderEdition(currentEdition, requestedLocale);
  } catch (error) {
    console.error("edition-load-failed", error);
    showEmpty("Lembar berita tidak dapat dibuka. Muat ulang halaman beberapa saat lagi.");
  }
}

elements.languageSwitch.addEventListener("click", () => {
  animateLanguageChange(
    currentLocale === CHINESE_LOCALE ? INDONESIAN_LOCALE : CHINESE_LOCALE,
  );
});

document.documentElement.classList.toggle("is-kemarin", isKemarinSheet);
elements.kemarinNotice.hidden = !isKemarinSheet;
if (isKemarinSheet) {
  applyStaticCopy(
    new Map([
      ["top-purpose", requestedLocale === CHINESE_LOCALE ? "昨日专页" : "LEMBAR KEMARIN"],
      [
        "intro-label",
        requestedLocale === CHINESE_LOCALE ? "昨日要闻" : "POKOK BERITA KEMARIN",
      ],
      ["edition-switch", requestedLocale === CHINESE_LOCALE ? "今日" : "HARI INI"],
      [
        "empty-title",
        requestedLocale === CHINESE_LOCALE
          ? "昨日专页仍在汇编之中。"
          : "Lembar Kemarin masih dihimpun.",
      ],
      [
        "empty-copy",
        requestedLocale === CHINESE_LOCALE
          ? "编辑机器尚未交付昨日专页。请于西澳中部标准时间七时以后再行阅览。"
          : "Mesin redaksi belum menyerahkan lembar Kemarin. Silakan datang kembali setelah pukul 07.00 WITA.",
      ],
    ]),
  );
}
updateLanguageSwitch();
updateEditionSwitch();
loadEdition();
