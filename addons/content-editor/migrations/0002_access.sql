CREATE TABLE IF NOT EXISTS wf_admins (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wf_project_members (
  project_id TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, email)
);

CREATE INDEX IF NOT EXISTS wf_project_members_email_lookup
  ON wf_project_members(email, project_id);
