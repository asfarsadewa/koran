const sectionLabels = {
  conflict: "Perang & Pertikaian",
  disaster: "Bencana",
  humanitarian: "Kemanusiaan",
  rights: "Hak Asasi",
  health: "Kesehatan",
  climate: "Iklim",
  economy: "Krisis Ekonomi",
};

const elements = {
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
};

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatEditionDate(value) {
  const date = new Date(`${value}T00:00:00+08:00`);
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Australia/Perth",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatSourceDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function storySection(article) {
  return make("p", "story-section", sectionLabels[article.section] ?? "Dunia");
}

function storySource(article) {
  const source = make("div", "story-source");
  source.append(
    make("span", "", "SUMBER"),
    make("strong", "", article.sourceName),
    make("span", "", formatSourceDate(article.sourcePublishedAt)),
    make("span", "source-arrow", "↗"),
  );
  return source;
}

function impactNote(article) {
  const note = make("p", "impact-note");
  note.append(make("strong", "", "AKIBAT: "), document.createTextNode(article.impact));
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

function externalLink(article, className) {
  const link = make("a", className);
  link.href = article.sourceUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", `${article.headline} — buka ${article.sourceName}`);
  return link;
}

function renderLead(article) {
  const link = externalLink(article, "lead-link");
  const headline = make("h2", "lead-headline", article.headline);
  if (article.headline.length > 64) headline.classList.add("lead-headline--long");
  const deck = make("p", "lead-dek", article.dek);
  const figure = storyFigure(article);
  link.append(storySection(article), headline);
  if (figure) link.append(figure);
  link.append(deck, impactNote(article), storySource(article));
  elements.lead.replaceChildren(link);
}

function renderWire(article) {
  const link = externalLink(article, "wire-story");
  link.append(
    storySection(article),
    make("h3", "", article.headline),
    make("p", "", article.dek),
    storySource(article),
  );
  return link;
}

function renderCard(article) {
  const link = externalLink(article, "story-card");
  const heading = make("h2", "", article.headline);
  const copy = make("div", "story-card__copy");
  const figure = storyFigure(article);
  if (figure) copy.append(figure);
  copy.append(make("p", "story-card__dek", article.dek), impactNote(article), storySource(article));
  link.append(storySection(article), heading, copy);
  return link;
}

function renderEdition(edition) {
  const articles = [...edition.articles].sort((left, right) => left.rank - right.rank);
  if (articles.length !== 8) throw new Error("Susunan edisi tidak lengkap.");

  const longDate = formatEditionDate(edition.editionDate);
  elements.issueNumber.textContent = String(edition.issueNumber).padStart(4, "0");
  elements.editionDate.textContent = longDate.toUpperCase();
  elements.editionDate.dateTime = edition.editionDate;
  elements.editionDateShort.textContent = longDate.toUpperCase();
  elements.curatorLine.textContent = `DIHIMPUN ${edition.curatorModel.toUpperCase()}`;
  elements.mastheadDek.textContent = edition.mastheadDek;
  elements.demoNotice.hidden = !edition.isDemo;
  document.title = `${articles[0].headline} — Juara Merdeka`;

  renderLead(articles[0]);
  elements.wire.replaceChildren(...articles.slice(1, 4).map(renderWire));
  elements.storyGrid.replaceChildren(...articles.slice(4).map(renderCard));

  elements.loading.hidden = true;
  elements.empty.hidden = true;
  elements.frontGrid.hidden = false;
  elements.storyGrid.hidden = false;
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
    renderEdition(payload.edition);
  } catch (error) {
    console.error("edition-load-failed", error);
    showEmpty("Lembar berita tidak dapat dibuka. Muat ulang halaman beberapa saat lagi.");
  }
}

loadEdition();
