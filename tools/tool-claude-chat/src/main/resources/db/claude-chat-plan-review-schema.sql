CREATE TABLE IF NOT EXISTS claude_chat_plan_review (
  session_id TEXT NOT NULL REFERENCES claude_chat_session(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  PRIMARY KEY(session_id, id)
);
CREATE INDEX IF NOT EXISTS idx_chat_plan_review_session ON claude_chat_plan_review(session_id, created_at);
