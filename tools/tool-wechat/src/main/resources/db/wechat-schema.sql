-- 微信监控模块表。SchemaInitializer 每次启动按 split(";") 执行,
-- 所有语句必须 IF NOT EXISTS,保证幂等。

-- 监听到的微信消息。监听轮询把 sidecar 取到的新消息落这里,供人在外面翻历史/检索。
-- msg_id 有值时用于去重(部分 wxauto 版本不给 id,此时靠时间顺序追加,可能有少量重复)。
CREATE TABLE IF NOT EXISTS wechat_message (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    chat        TEXT,
    sender      TEXT,
    content     TEXT,
    type        TEXT,
    sent_time   TEXT,
    msg_id      TEXT,
    created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wechat_message_chat    ON wechat_message(chat, id);
CREATE INDEX IF NOT EXISTS idx_wechat_message_created ON wechat_message(created_at);
CREATE INDEX IF NOT EXISTS idx_wechat_message_msgid   ON wechat_message(msg_id);
