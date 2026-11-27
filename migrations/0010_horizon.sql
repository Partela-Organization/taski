-- Horizonte: Notion-style documents for future plans, ideas and research.
-- Blocks are stored as one JSON array per document version; inline formatting stays as Markdown text.
CREATE TABLE horizon_docs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  status TEXT NOT NULL CHECK (status IN ('idea','exploring','planned','archived')),
  area_id TEXT,
  blocks TEXT NOT NULL CHECK (json_valid(blocks) AND json_type(blocks) = 'array'),
  version INTEGER NOT NULL CHECK (version > 0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX horizon_docs_updated ON horizon_docs(deleted_at, updated_at);

CREATE TRIGGER horizon_docs_insert_guard BEFORE INSERT ON horizon_docs
WHEN NEW.version != 1 OR NEW.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'VERSION_CONFLICT'); END;

CREATE TRIGGER horizon_docs_update_guard BEFORE UPDATE ON horizon_docs
BEGIN
  SELECT CASE WHEN OLD.deleted_at IS NOT NULL OR NEW.version != OLD.version + 1 THEN RAISE(ABORT, 'VERSION_CONFLICT') END;
  SELECT CASE WHEN NEW.id != OLD.id OR NEW.created_by != OLD.created_by OR NEW.created_at != OLD.created_at
    THEN RAISE(ABORT, 'IMMUTABLE_IDENTITY') END;
END;

CREATE TRIGGER horizon_docs_no_delete BEFORE DELETE ON horizon_docs
BEGIN SELECT RAISE(ABORT, 'HORIZON_DELETE_DISABLED'); END;

-- Append-only history: actor, server time and which properties changed (block content is summarized by count).
CREATE TABLE horizon_activity (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT NOT NULL REFERENCES horizon_docs(id),
  doc_version INTEGER NOT NULL,
  actor TEXT NOT NULL CHECK (json_valid(actor)),
  changes TEXT NOT NULL CHECK (json_valid(changes)),
  created_at TEXT NOT NULL,
  UNIQUE(doc_id, doc_version)
);
CREATE TRIGGER horizon_activity_no_update BEFORE UPDATE ON horizon_activity
BEGIN SELECT RAISE(ABORT, 'AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER horizon_activity_no_delete BEFORE DELETE ON horizon_activity
BEGIN SELECT RAISE(ABORT, 'AUDIT_APPEND_ONLY'); END;
