import {
  CHINESE_LOCALE,
  INDONESIAN_LOCALE,
  formatEditionDate,
  formatSourceDate,
  hasChineseEdition,
  mixLanguageText,
} from "./language.js";

const staticCopy = {
  "skip-link": { id: "Langsung ke berita utama", zhHans: "直接阅览头版新闻" },
  "top-purpose": { id: "HARIAN IKHTISAR DUNIA", zhHans: "世界新闻摘要日报" },
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
  editorialStamp: document.querySelector(".editorial-stamp"),
  languageSwitch: document.querySelector("#language-switch"),
  languageCurrent: document.querySelector("#language-current"),
  languageTarget: document.querySelector("#language-target"),
};

let currentEdition = null;
let currentLocale = INDONESIAN_LOCALE;
let languageIsChanging = false;

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

function renderLead(article, locale) {
  const link = externalLink(article, "lead-link", locale);
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
  elements.lead.replaceChildren(link);
}

function renderWire(article, locale) {
  const link = externalLink(article, "wire-story", locale);
  link.append(
    storySection(article, locale),
    make("h3", "", article.headline, `article-${article.rank}-headline`),
    make("p", "", article.dek, `article-${article.rank}-dek`),
    storySource(article, locale),
  );
  return link;
}

function renderCard(article, locale) {
  const link = externalLink(article, "story-card", locale);
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
  return link;
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

  elements.loading.hidden = true;
  elements.empty.hidden = true;
  elements.frontGrid.hidden = false;
  elements.storyGrid.hidden = false;
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
}

async function loadEdition() {
  try {
    const response = await fetch("/api/edition", {
      headers: { accept: "application/json" },
      credentials: "same-origin",
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok || !payload.edition) {
      showEmpty(payload.error);
      return;
    }
    currentEdition = payload.edition;
    renderEdition(currentEdition);
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

updateLanguageSwitch();
loadEdition();
