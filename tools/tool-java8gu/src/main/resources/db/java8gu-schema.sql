-- Java 八股 schema
-- 由 toolbox-common SchemaInitializer 启动时自动加载（classpath*:db/*-schema.sql）
-- 所有语句必须幂等：CREATE ... IF NOT EXISTS

-- AI 补全缓存：把一道题的结构化补全结果（图解/面试问答/易错点/深度讲解）按内容哈希缓存，
-- 命中直接返回、绝不重复调用 LLM。内容变了（hash 变）自然产生新行，旧行留作历史。
CREATE TABLE IF NOT EXISTS tool_java8gu_enrich (
    id          TEXT NOT NULL,              -- 题号
    hash        TEXT NOT NULL,              -- 题目 markdown 的 sha-256（内容指纹）
    payload     TEXT NOT NULL,              -- 补全结果 JSON（diagram/qa/pitfalls/explanation）
    model       TEXT,                       -- 生成所用模型档位/名称，便于追溯
    created_at  TEXT NOT NULL,              -- ISO-8601 UTC
    PRIMARY KEY (id, hash)
);

CREATE INDEX IF NOT EXISTS idx_java8gu_enrich_id ON tool_java8gu_enrich(id);
