-- Apply once to the existing shared database, before deploying the updated Worker.
-- Existing comments remain root comments. Deleted bodies are retained for admin history.
ALTER TABLE wf_comments ADD COLUMN parent_id INTEGER;
ALTER TABLE wf_comments ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS wf_comments_activity
  ON wf_comments(project_id, changed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS wf_content_history_activity
  ON wf_content_history(project_id, changed_at DESC, id DESC);
