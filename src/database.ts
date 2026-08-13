import {
  DEFAULT_EDITION_KIND,
  editionIdFor,
  isEditionKind,
  resolvedPublicationDate,
  type EditionKind,
  type EditionPublishInput,
  type PublishedEdition,
} from "../shared/edition";

interface EditionRow {
  id: string;
  kind: string | null;
  edition_date: string;
  publication_date: string | null;
  issue_number: number;
  masthead_dek: string;
  published_at: string;
  curator_model: string;
  is_demo: number;
  masthead_dek_zh: string | null;
}

interface ArticleRow {
  id: string;
  rank: number;
  section: PublishedEdition["articles"][number]["section"];
  headline: string;
  dek: string;
  dateline: string;
  source_name: string;
  source_url: string;
  source_published_at: string;
  impact: string;
  image_url: string | null;
  headline_zh: string | null;
  dek_zh: string | null;
  dateline_zh: string | null;
  impact_zh: string | null;
}

interface TranslatedArticleRow extends ArticleRow {
  headline_zh: string;
  dek_zh: string;
  dateline_zh: string;
  impact_zh: string;
}

function hasChineseTranslation(article: ArticleRow): article is TranslatedArticleRow {
  return (
    typeof article.headline_zh === "string" &&
    typeof article.dek_zh === "string" &&
    typeof article.dateline_zh === "string" &&
    typeof article.impact_zh === "string"
  );
}

export async function readEdition(
  database: D1Database,
  editionDate?: string,
  kind: EditionKind = DEFAULT_EDITION_KIND,
): Promise<PublishedEdition | null> {
  const editionQuery = database.prepare(
    `SELECT e.id, e.kind, e.edition_date, e.publication_date, e.issue_number, e.masthead_dek,
            e.published_at, e.curator_model, e.is_demo, et.masthead_dek AS masthead_dek_zh
     FROM editions e
     LEFT JOIN edition_translations et
       ON et.edition_id = e.id AND et.locale = 'zh-Hans'
     WHERE e.kind = ?
     ${editionDate ? "AND e.publication_date = ?" : ""}
     ORDER BY e.publication_date DESC
     LIMIT 1`,
  );
  const edition = editionDate
    ? await editionQuery.bind(kind, editionDate).first<EditionRow>()
    : await editionQuery.bind(kind).first<EditionRow>();

  if (!edition) return null;

  const articleResult = await database
    .prepare(
      `SELECT a.id, a.rank, a.section, a.headline, a.dek, a.dateline, a.source_name,
              a.source_url, a.source_published_at, a.impact, a.image_url,
              at.headline AS headline_zh, at.dek AS dek_zh, at.dateline AS dateline_zh,
              at.impact AS impact_zh
       FROM articles a
       LEFT JOIN article_translations at
         ON at.article_id = a.id AND at.locale = 'zh-Hans'
       WHERE a.edition_id = ?
       ORDER BY a.rank ASC`,
    )
    .bind(edition.id)
    .all<ArticleRow>();

  const articles = articleResult.results.map((article) => ({
    id: article.id,
    rank: article.rank,
    section: article.section,
    headline: article.headline,
    dek: article.dek,
    dateline: article.dateline,
    sourceName: article.source_name,
    sourceUrl: article.source_url,
    sourcePublishedAt: article.source_published_at,
    impact: article.impact,
    ...(article.image_url ? { imageUrl: article.image_url } : {}),
  }));
  const chineseArticles = articleResult.results.filter(hasChineseTranslation);
  const chineseMastheadDek = edition.masthead_dek_zh;
  const translations =
    typeof chineseMastheadDek === "string" &&
    articleResult.results.length === 8 &&
    chineseArticles.length === 8
      ? {
          zhHans: {
            mastheadDek: chineseMastheadDek,
            articles: chineseArticles.map((article) => ({
              rank: article.rank,
              headline: article.headline_zh,
              dek: article.dek_zh,
              dateline: article.dateline_zh,
              impact: article.impact_zh,
            })),
          },
        }
      : undefined;

  const editionKind = isEditionKind(edition.kind) ? edition.kind : DEFAULT_EDITION_KIND;

  return {
    id: edition.id,
    kind: editionKind,
    editionDate: edition.edition_date,
    publicationDate: edition.publication_date ?? edition.edition_date,
    issueNumber: edition.issue_number,
    mastheadDek: edition.masthead_dek,
    publishedAt: edition.published_at,
    curatorModel: edition.curator_model,
    isDemo: edition.is_demo === 1,
    articles,
    ...(translations ? { translations } : {}),
  };
}

export async function readLatestEdition(database: D1Database): Promise<PublishedEdition | null> {
  return readEdition(database);
}

export async function readArticleImageUrl(
  database: D1Database,
  editionDate: string,
  articleRank: number,
  kind: EditionKind = DEFAULT_EDITION_KIND,
): Promise<string | null> {
  const row = await database
    .prepare(
      `SELECT a.image_url
       FROM articles a
       INNER JOIN editions e ON e.id = a.edition_id
       WHERE e.kind = ? AND e.publication_date = ? AND a.rank = ?
       LIMIT 1`,
    )
    .bind(kind, editionDate, articleRank)
    .first<{ image_url: string | null }>();
  return row?.image_url ?? null;
}

export async function publishEdition(
  database: D1Database,
  edition: EditionPublishInput,
): Promise<{ editionId: string; articleCount: number }> {
  const kind = edition.kind ?? DEFAULT_EDITION_KIND;
  const publicationDate = resolvedPublicationDate(kind, edition.editionDate, edition.publicationDate);
  const editionId = editionIdFor(kind, publicationDate);
  const publishedAt = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `INSERT INTO editions
           (id, kind, edition_date, publication_date, issue_number, masthead_dek,
            published_at, curator_model, is_demo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET
           kind = excluded.kind,
           edition_date = excluded.edition_date,
           publication_date = excluded.publication_date,
           issue_number = excluded.issue_number,
           masthead_dek = excluded.masthead_dek,
           published_at = excluded.published_at,
           curator_model = excluded.curator_model,
           is_demo = 0`,
      )
      .bind(
        editionId,
        kind,
        edition.editionDate,
        publicationDate,
        edition.issueNumber,
        edition.mastheadDek,
        publishedAt,
        edition.curatorModel,
      ),
    database.prepare("DELETE FROM articles WHERE edition_id = ?").bind(editionId),
    database
      .prepare(
        `INSERT INTO edition_translations (edition_id, locale, masthead_dek)
         VALUES (?, 'zh-Hans', ?)
         ON CONFLICT(edition_id, locale) DO UPDATE SET
           masthead_dek = excluded.masthead_dek`,
      )
      .bind(editionId, edition.translations.zhHans.mastheadDek),
  ];

  const chineseByRank = new Map(
    edition.translations.zhHans.articles.map((article) => [article.rank, article]),
  );

  for (const article of [...edition.articles].sort((left, right) => left.rank - right.rank)) {
    const chineseArticle = chineseByRank.get(article.rank);
    if (!chineseArticle) {
      throw new Error(`Missing Chinese translation for article rank ${article.rank}`);
    }
    const articleId = `${editionId}-${article.rank}`;
    statements.push(
      database
        .prepare(
          `INSERT INTO articles
             (id, edition_id, rank, section, headline, dek, dateline, source_name,
              source_url, source_published_at, impact, image_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          articleId,
          editionId,
          article.rank,
          article.section,
          article.headline,
          article.dek,
          article.dateline,
          article.sourceName,
          article.sourceUrl,
          article.sourcePublishedAt,
          article.impact,
          article.imageUrl ?? null,
        ),
      database
        .prepare(
          `INSERT INTO article_translations
             (article_id, locale, headline, dek, dateline, impact)
           VALUES (?, 'zh-Hans', ?, ?, ?, ?)`,
        )
        .bind(
          articleId,
          chineseArticle.headline,
          chineseArticle.dek,
          chineseArticle.dateline,
          chineseArticle.impact,
        ),
    );
  }

  await database.batch(statements);
  return { editionId, articleCount: edition.articles.length };
}
