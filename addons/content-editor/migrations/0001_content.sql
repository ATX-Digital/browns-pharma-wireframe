CREATE TABLE IF NOT EXISTS wf_content_values (
  project_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  content_key TEXT NOT NULL,
  value TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, version_id, content_key)
);

CREATE TABLE IF NOT EXISTS wf_content_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  content_key TEXT NOT NULL,
  old_value TEXT NOT NULL,
  new_value TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS wf_content_values_lookup
  ON wf_content_values(project_id, version_id);

CREATE INDEX IF NOT EXISTS wf_content_history_lookup
  ON wf_content_history(project_id, version_id, content_key, id DESC);

CREATE TABLE IF NOT EXISTS wf_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  route TEXT NOT NULL,
  target_key TEXT NOT NULL,
  body TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS wf_comments_lookup
  ON wf_comments(project_id, version_id, id DESC);
