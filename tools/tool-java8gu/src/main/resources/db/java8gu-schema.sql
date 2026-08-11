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

CREATE TABLE IF NOT EXISTS java8_node (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    node_type TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 0,
    parent_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    create_time TEXT NOT NULL,
    update_time TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_java8_node_parent ON java8_node(parent_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_java8_node_type ON java8_node(node_type);

CREATE TABLE IF NOT EXISTS java8_relation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    create_time TEXT NOT NULL,
    update_time TEXT NOT NULL,
    UNIQUE(source_id, target_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_java8_relation_source ON java8_relation(source_id);
CREATE INDEX IF NOT EXISTS idx_java8_relation_target ON java8_relation(target_id);

CREATE TABLE IF NOT EXISTS java8_example (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    title TEXT NOT NULL,
    before_code TEXT NOT NULL DEFAULT '',
    after_code TEXT NOT NULL DEFAULT '',
    explanation TEXT NOT NULL DEFAULT '',
    create_time TEXT NOT NULL,
    update_time TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_java8_example_node ON java8_example(node_id);

CREATE TABLE IF NOT EXISTS java8_interview (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    question TEXT NOT NULL,
    short_answer TEXT NOT NULL DEFAULT '',
    detail_answer TEXT NOT NULL DEFAULT '',
    project_answer TEXT NOT NULL DEFAULT '',
    create_time TEXT NOT NULL,
    update_time TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_java8_interview_node ON java8_interview(node_id);
