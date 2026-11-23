CREATE TABLE ticket_key_aliases (
  key TEXT PRIMARY KEY NOT NULL,
  ticket_id TEXT NOT NULL REFERENCES tickets(id)
);
