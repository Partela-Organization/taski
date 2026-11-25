ALTER TABLE tickets ADD COLUMN deleted_at TEXT;

DROP TRIGGER tickets_update_guard;
CREATE TRIGGER tickets_update_guard BEFORE UPDATE ON tickets
BEGIN
  SELECT CASE WHEN OLD.deleted_at IS NOT NULL OR NEW.version != OLD.version + 1
    THEN RAISE(ABORT, 'VERSION_CONFLICT') END;
  SELECT CASE WHEN NEW.id != OLD.id OR NEW.number != OLD.number OR NEW.prefix != OLD.prefix
    OR NEW.base_url != OLD.base_url OR NEW.created_at != OLD.created_at OR NEW.created_by != OLD.created_by
    THEN RAISE(ABORT, 'IMMUTABLE_IDENTITY') END;
END;
