import type { EditionPublishInput, PublishedEdition } from "../shared/edition";

interface EditionRow {
  id: string;
  edition_date: string;
  issue_number: number;
  masthead_dek: string;
  published_at: string;
  curator_model: string;
  is_demo: number;
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
}

export async function readLatestEdition(database: D1Database): Promise<PublishedEdition | null> {
  const edition = await database
    .prepare(
      `SELECT id, edition_date, issue_number, masthead_dek, published_at, curator_model, is_demo
       FROM editions
       ORDER BY edition_date DESC
       LIMIT 1`,
    )
    .first<EditionRow>();

  if (!edition) return null;

  const articleResult = await database
    .prepare(
      `SELECT id, rank, section, headline, dek, dateline, source_name, source_url,
              source_published_at, impact, image_url
       FROM articles
       WHERE edition_id = ?
       ORDER BY rank ASC`,
    )
    .bind(edition.id)
    .all<ArticleRow>();

  return {
    id: edition.id,
    editionDate: edition.edition_date,
    issueNumber: edition.issue_number,
    mastheadDek: edition.masthead_dek,
    publishedAt: edition.published_at,
    curatorModel: edition.curator_model,
    isDemo: edition.is_demo === 1,
    articles: articleResult.results.map((article) => ({
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
    })),
  };
}

export async function publishEdition(
  database: D1Database,
  edition: EditionPublishInput,
): Promise<{ editionId: string; articleCount: number }> {
  const editionId = edition.editionDate;
  const publishedAt = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `INSERT INTO editions
           (id, edition_date, issue_number, masthead_dek, published_at, curator_model, is_demo)
         VALUES (?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET
           issue_number = excluded.issue_number,
           masthead_dek = excluded.masthead_dek,
           published_at = excluded.published_at,
           curator_model = excluded.curator_model,
           is_demo = 0`,
      )
      .bind(
        editionId,
        edition.editionDate,
        edition.issueNumber,
        edition.mastheadDek,
        publishedAt,
        edition.curatorModel,
      ),
    database.prepare("DELETE FROM articles WHERE edition_id = ?").bind(editionId),
  ];

  for (const article of [...edition.articles].sort((left, right) => left.rank - right.rank)) {
    statements.push(
      database
        .prepare(
          `INSERT INTO articles
             (id, edition_id, rank, section, headline, dek, dateline, source_name,
              source_url, source_published_at, impact, image_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          `${editionId}-${article.rank}`,
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
    );
  }

  await database.batch(statements);
  return { editionId, articleCount: edition.articles.length };
}
