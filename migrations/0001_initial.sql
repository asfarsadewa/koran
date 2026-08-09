PRAGMA foreign_keys = ON;

CREATE TABLE editions (
  id TEXT PRIMARY KEY,
  edition_date TEXT NOT NULL UNIQUE,
  issue_number INTEGER NOT NULL CHECK (issue_number > 0),
  masthead_dek TEXT NOT NULL,
  published_at TEXT NOT NULL,
  curator_model TEXT NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1))
);

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

CREATE INDEX articles_by_edition_rank ON articles (edition_id, rank);
CREATE INDEX editions_by_date ON editions (edition_date DESC);
