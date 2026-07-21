-- Fore- 业务系统咨询归档 schema（SQLite）
-- 复用 claude-chat 会话引擎回答业务咨询，本表只做归档 + 查询，不含独立回答引擎。
-- archive_status: PENDING（会话进行中）| SUCCESS（归档成功）| FAILED（写库/解析失败待补偿）
CREATE TABLE IF NOT EXISTS consult_session (
    session_id          TEXT    PRIMARY KEY,              -- UUID，会话唯一标识
    user_id             TEXT,                             -- 发起咨询的用户（沿用现有登录体系）
    system_name         TEXT    NOT NULL,                 -- 所选系统名（来自 workspaces）
    system_source_path  TEXT    NOT NULL,                 -- 所选系统源码路径快照（会话 cwd）
    module_names        TEXT,                             -- 所选模块名列表，JSON 数组字符串 ["采购","退货"]
    prompt_snapshot     TEXT,                             -- 变量替换后的约束提示词快照（可追溯）
    dev_session_id      TEXT,                             -- 关联的 claude-chat 会话 id（chat.sessionId）
    raw_reference_json  TEXT,                             -- 引擎回吐的引用清单原始 JSON（容错留档）
    parse_status        TEXT    DEFAULT 'NONE',           -- NONE|OK|FAILED，引用清单解析状态
    archive_status      TEXT    NOT NULL DEFAULT 'PENDING',
    error_msg           TEXT,                             -- 归档失败原因
    created_at          INTEGER NOT NULL,                 -- 会话创建时间（Unix 毫秒）
    ended_at            INTEGER                           -- 会话结束时间
);

CREATE TABLE IF NOT EXISTS consult_turn (
    turn_id              TEXT    PRIMARY KEY,             -- UUID
    session_id           TEXT    NOT NULL,                -- 关联 consult_session（应用层维护，不建外键）
    turn_index           INTEGER NOT NULL,                -- 轮次序号，从 1 开始
    question             TEXT,                            -- 用户提问原文
    answer               TEXT,                            -- 返回给用户的自然语言业务解答原文
    ref_menu_paths       TEXT,                            -- 命中的前端菜单路径/菜单名，JSON 数组
    ref_graphify_nodes   TEXT,                            -- 命中的 graphify 图谱节点，JSON 数组
    ref_domain_knowledge TEXT,                            -- 命中的 domain-knowledge 条目，JSON 数组
    created_at           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_consult_session_created ON consult_session(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consult_session_user    ON consult_session(user_id);
CREATE INDEX IF NOT EXISTS idx_consult_turn_session    ON consult_turn(session_id, turn_index);

-- 业务系统展示偏好：对工作台接口传来的项目做「别名 + 过滤 + 排序」的呈现层覆盖。
-- 只存被定制过的系统；无记录的系统默认可见、用原名。系统字典仍来自 claude-chat workspaces，本表不复制字典。
-- system_name 作为身份键（与前端 projects 去重后的 name 一致）。visible: 1 显示 | 0 过滤隐藏。
CREATE TABLE IF NOT EXISTS consult_system_pref (
    system_name         TEXT    PRIMARY KEY,              -- 系统原名（工作区项目名，身份键）
    system_source_path  TEXT,                             -- 源码路径快照（仅供配置界面展示/追溯）
    alias               TEXT,                             -- 业务别名（为空则用原名）
    visible             INTEGER NOT NULL DEFAULT 1,       -- 1 显示 | 0 过滤隐藏
    sort_order          INTEGER NOT NULL DEFAULT 0,       -- 排序权重，小的靠前
    updated_at          INTEGER NOT NULL
);

-- 系统链路分析结果（持久化）：cross-topology 引擎查出的系统间关系边，整表在每次分析时替换。
-- 全局单份拓扑，(from_system,to_system) 唯一。前端加载时读取渲染，无需重新调引擎。
CREATE TABLE IF NOT EXISTS consult_topology_link (
    from_system  TEXT    NOT NULL,                        -- 起点系统原名
    to_system    TEXT    NOT NULL,                        -- 终点系统原名
    relation     TEXT,                                    -- 关系类型短标签（调用/依赖/数据流…）
    description  TEXT,                                    -- 关系说明
    created_at   INTEGER NOT NULL,                        -- 该次分析时间（Unix 毫秒）
    PRIMARY KEY (from_system, to_system)
);
