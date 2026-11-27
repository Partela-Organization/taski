-- Track plans: mutable priority and target date for configured areas.
-- Area IDs and labels stay in the installation configuration.
CREATE TABLE area_plans (
  area_id TEXT PRIMARY KEY,
  priority INTEGER NOT NULL CHECK (priority IN (1,2,3)),
  target_date TEXT CHECK (target_date IS NULL OR (length(target_date) = 10 AND date(target_date) = target_date)),
  version INTEGER NOT NULL CHECK (version > 0),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TRIGGER area_plans_insert_guard BEFORE INSERT ON area_plans
WHEN NEW.version != 1
BEGIN SELECT RAISE(ABORT, 'VERSION_CONFLICT'); END;

CREATE TRIGGER area_plans_update_guard BEFORE UPDATE ON area_plans
BEGIN
  SELECT CASE WHEN NEW.version != OLD.version + 1 OR NEW.area_id != OLD.area_id THEN RAISE(ABORT, 'VERSION_CONFLICT') END;
END;

CREATE TRIGGER area_plans_no_delete BEFORE DELETE ON area_plans
BEGIN SELECT RAISE(ABORT, 'AREA_PLAN_DELETE_DISABLED'); END;

-- Ticket activity requires a ticket; track changes keep their own append-only history.
CREATE TABLE area_activity (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  area_id TEXT NOT NULL,
  area_version INTEGER NOT NULL,
  actor TEXT NOT NULL CHECK (json_valid(actor)),
  changes TEXT NOT NULL CHECK (json_valid(changes)),
  created_at TEXT NOT NULL,
  UNIQUE(area_id, area_version)
);
CREATE TRIGGER area_activity_no_update BEFORE UPDATE ON area_activity
BEGIN SELECT RAISE(ABORT, 'AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER area_activity_no_delete BEFORE DELETE ON area_activity
BEGIN SELECT RAISE(ABORT, 'AUDIT_APPEND_ONLY'); END;
