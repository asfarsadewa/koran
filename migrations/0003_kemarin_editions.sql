PRAGMA foreign_keys = OFF;

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

CREATE INDEX editions_by_date ON editions (edition_date DESC);
CREATE INDEX editions_by_kind_publication ON editions (kind, publication_date DESC);

PRAGMA foreign_keys = ON;
