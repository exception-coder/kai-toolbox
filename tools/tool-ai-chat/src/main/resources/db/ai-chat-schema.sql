-- AI 对话（API 直连）模块的会话与消息持久化。
-- 与 Vibe coding（claude-chat）不同：本模块直接以 OpenAI 兼容协议调 4sapi，完整对话内容落本表。
-- 注意：SchemaInitializer 按分号朴素切分，所有语句必须 IF NOT EXISTS，注释里不能出现分号。

CREATE TABLE IF NOT EXISTS ai_chat_conversation (
    id            TEXT PRIMARY KEY,
    title         TEXT,
    model         TEXT    NOT NULL,
    kind          TEXT    NOT NULL DEFAULT 'chat',
    system_prompt TEXT,
    temperature   REAL,
    max_tokens    INTEGER,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_conv_updated
    ON ai_chat_conversation(updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_chat_message (
    id                TEXT PRIMARY KEY,
    conversation_id   TEXT    NOT NULL,
    role              TEXT    NOT NULL,
    content           TEXT,
    model             TEXT,
    attachments_json  TEXT,
    status            TEXT    NOT NULL,
    created_at        INTEGER NOT NULL,
    -- 助手消息指标（用户消息为空）：耗时与 token 用量，缓存命中体现在 cached_tokens
    latency_ms        INTEGER,
    prompt_tokens     INTEGER,
    completion_tokens INTEGER,
    total_tokens      INTEGER,
    cached_tokens     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_msg_conv
    ON ai_chat_message(conversation_id, created_at);
