PRAGMA foreign_keys = ON;

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
