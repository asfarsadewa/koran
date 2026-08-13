-- D1 always enforces foreign keys and does not honour `PRAGMA foreign_keys = OFF`.
-- Dropping `editions` while `articles` and `edition_translations` still reference it
-- would fire their ON DELETE CASCADE and empty every child table, so the child rows
-- are parked in staging tables (created by CTAS, therefore without foreign keys)
-- while the parent is rebuilt, then restored against the new `editions`.

CREATE TABLE articles_stage AS SELECT * FROM articles;
CREATE TABLE edition_translations_stage AS SELECT * FROM edition_translations;
CREATE TABLE article_translations_stage AS SELECT * FROM article_translations;

DROP TABLE article_translations;
DROP TABLE articles;
DROP TABLE edition_translations;

CREATE TABLE editions_new (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'hari_ini' CHECK (kind IN ('hari_ini', 'kemarin')),
  edition_date TEXT NOT NULL,
  publication_date TEXT NOT NULL,
  issue_number INTEGER NOT NULL CHECK (issue_number > 0),
  masthead_dek TEXT NOT NULL,
  published_at TEXT NOT NULL,
  curator_model TEXT NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  UNIQUE (kind, publication_date)
);

INSERT INTO editions_new (
  id, kind, edition_date, publication_date, issue_number,
  masthead_dek, published_at, curator_model, is_demo
)
SELECT
  id, 'hari_ini', edition_date, edition_date, issue_number,
  masthead_dek, published_at, curator_model, is_demo
FROM editions;

DROP TABLE editions;
ALTER TABLE editions_new RENAME TO editions;

CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 8),
  section TEXT NOT NULL CHECK (
    section IN ('conflict', 'disaster', 'humanitarian', 'rights', 'health', 'climate', 'economy')
  ),
  headline TEXT NOT NULL,
  dek TEXT NOT NULL,
  dateline TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_published_at TEXT NOT NULL,
  impact TEXT NOT NULL,
  image_url TEXT,
  UNIQUE (edition_id, rank),
  UNIQUE (edition_id, source_url)
);

CREATE TABLE edition_translations (
  edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('zh-Hans')),
  masthead_dek TEXT NOT NULL,
  PRIMARY KEY (edition_id, locale)
);

CREATE TABLE article_translations (
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('zh-Hans')),
  headline TEXT NOT NULL,
  dek TEXT NOT NULL,
  dateline TEXT NOT NULL,
  impact TEXT NOT NULL,
  PRIMARY KEY (article_id, locale)
);

INSERT INTO articles (
  id, edition_id, rank, section, headline, dek, dateline,
  source_name, source_url, source_published_at, impact, image_url
)
SELECT
  id, edition_id, rank, section, headline, dek, dateline,
  source_name, source_url, source_published_at, impact, image_url
FROM articles_stage;

INSERT INTO edition_translations (edition_id, locale, masthead_dek)
SELECT edition_id, locale, masthead_dek FROM edition_translations_stage;

INSERT INTO article_translations (article_id, locale, headline, dek, dateline, impact)
SELECT article_id, locale, headline, dek, dateline, impact FROM article_translations_stage;

DROP TABLE article_translations_stage;
DROP TABLE articles_stage;
DROP TABLE edition_translations_stage;

CREATE INDEX articles_by_edition_rank ON articles (edition_id, rank);
CREATE INDEX editions_by_date ON editions (edition_date DESC);
CREATE INDEX editions_by_kind_publication ON editions (kind, publication_date DESC);
