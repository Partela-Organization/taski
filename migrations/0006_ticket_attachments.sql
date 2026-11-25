CREATE TABLE ticket_attachments (
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 180),
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
  digest TEXT NOT NULL,
  uploader_id TEXT NOT NULL,
  uploader TEXT NOT NULL CHECK (json_valid(uploader)),
  reserved_at INTEGER NOT NULL,
  uploaded_at TEXT,
  removed_at TEXT,
  removed_by TEXT CHECK (removed_by IS NULL OR json_valid(removed_by)),
  CHECK ((removed_at IS NULL) = (removed_by IS NULL)),
  PRIMARY KEY (ticket_id, id)
);

CREATE INDEX ticket_attachments_active ON ticket_attachments(ticket_id, uploaded_at, id)
WHERE removed_at IS NULL;
