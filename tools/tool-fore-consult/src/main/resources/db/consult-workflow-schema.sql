CREATE TABLE IF NOT EXISTS consult_agent_workflow (
    agent_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    workflow_json TEXT NOT NULL,
    PRIMARY KEY (agent_id, version)
);
CREATE TABLE IF NOT EXISTS consult_session_workflow (
    session_id TEXT PRIMARY KEY,
    version INTEGER,
    workflow_json TEXT NOT NULL
);
