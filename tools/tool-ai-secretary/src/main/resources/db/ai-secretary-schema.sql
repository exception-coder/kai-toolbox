-- AI 秘书：记录态产出的结构化记录。所有 DDL 必须 IF NOT EXISTS（SchemaInitializer 每次启动都跑）。
CREATE TABLE IF NOT EXISTS ai_secretary_note (
    id            TEXT PRIMARY KEY,
    raw_text      TEXT    NOT NULL,           -- 用户原始输入（绝不丢失）
    category      TEXT    NOT NULL,           -- NoteCategory 枚举名
    title         TEXT    NOT NULL,           -- LLM 提炼的一句话标题
    due_time      TEXT,                       -- ISO-8601 绝对时间，可空
    amount        REAL,                       -- 开销金额（元），可空
    tags          TEXT    NOT NULL DEFAULT '[]', -- JSON 字符串数组
    confidence    REAL    NOT NULL DEFAULT 0,
    needs_review  INTEGER NOT NULL DEFAULT 0, -- 低置信 / 未分类 → 待人工复核
    status        TEXT    NOT NULL DEFAULT 'open', -- 待办用：open/done
    created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_secretary_note_created  ON ai_secretary_note(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_secretary_note_category ON ai_secretary_note(category, created_at);

-- 附件：上传的文件落服务端盘，元数据入库并关联 note。
CREATE TABLE IF NOT EXISTS ai_secretary_attachment (
    id           TEXT PRIMARY KEY,
    note_id      TEXT    NOT NULL,
    file_name    TEXT    NOT NULL,
    mime_type    TEXT,
    size_bytes   INTEGER NOT NULL DEFAULT 0,
    stored_path  TEXT    NOT NULL,           -- 服务端绝对路径
    created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_secretary_attachment_note ON ai_secretary_attachment(note_id);
