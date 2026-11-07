# DDL 基线 · kai-toolbox SQLite schema

> 用途：编写 SQL、修改 DAO/Repository、核对字段或评审 schema migration 前必读的权威结构源。
> 数据源：本机当前运行库 `C:\Users\zhang\.kai-toolbox\toolbox.db`（仅记录路径，不包含业务数据或凭据）。
> dump 方式：Python sqlite3 以只读事务查询 `sqlite_master`，保留 TABLE / INDEX / VIEW / TRIGGER 的原始 `CREATE` 语句。
> 对象数量：**112** 张业务表、**169** 个显式索引、**0** 个视图、**0** 个触发器｜生成日期：2026-08-13。
> 更新时机：schema 变化后按文末说明核对并更新项目内快照；本文件仅记录结构，不代表本次需求需要新增 SQL。
>
> ✅ 本文件来自真实运行库，不是根据 ORM 实体、Repository 或代码命名反推。字段名、类型、默认值、主键、约束和显式索引以下方 DDL 为准。

---

## 全局约定

- SQLite 类型采用动态类型系统；DDL 中的声明类型表示列 affinity，业务读写仍需遵守应用层约束。
- `INTEGER PRIMARY KEY AUTOINCREMENT` 表会由 SQLite 维护内部 `sqlite_sequence`；内部 `sqlite_*` 对象不计入业务表且不在本文展开。
- `sqlite_autoindex_*` 没有独立 `CREATE INDEX` SQL，由 `PRIMARY KEY` / `UNIQUE` 约束隐式生成，不重复列出。
- DDL 只证明实现结构，不单独证明字段的业务语义；状态与口径需继续查对应业务知识卡。

---

# Tables

## ai_chat_conversation

```sql
CREATE TABLE ai_chat_conversation (
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
```

## ai_chat_message

```sql
CREATE TABLE ai_chat_message (
    id                TEXT PRIMARY KEY,
    conversation_id   TEXT    NOT NULL,
    role              TEXT    NOT NULL,
    content           TEXT,
    model             TEXT,
    attachments_json  TEXT,
    status            TEXT    NOT NULL,
    created_at        INTEGER NOT NULL,
    
    latency_ms        INTEGER,
    prompt_tokens     INTEGER,
    completion_tokens INTEGER,
    total_tokens      INTEGER,
    cached_tokens     INTEGER
);
```

## ai_secretary_attachment

```sql
CREATE TABLE ai_secretary_attachment (
    id           TEXT PRIMARY KEY,
    note_id      TEXT    NOT NULL,
    file_name    TEXT    NOT NULL,
    mime_type    TEXT,
    size_bytes   INTEGER NOT NULL DEFAULT 0,
    stored_path  TEXT    NOT NULL,           -- 服务端绝对路径
    created_at   INTEGER NOT NULL
);
```

## ai_secretary_memory

```sql
CREATE TABLE ai_secretary_memory (
    id             TEXT PRIMARY KEY,
    category       TEXT    NOT NULL,            
    mem_key        TEXT    NOT NULL,            
    value          TEXT    NOT NULL,            
    detail         TEXT,                        
    source_note_id TEXT,                        
    confidence     REAL    NOT NULL DEFAULT 0,
    status         TEXT    NOT NULL DEFAULT 'PROPOSED', 
    pinned         INTEGER NOT NULL DEFAULT 0,  
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
);
```

## ai_secretary_note

```sql
CREATE TABLE ai_secretary_note (
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
```

## auth_refresh_token

```sql
CREATE TABLE auth_refresh_token (
    jti        TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    token_hash TEXT    NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked    INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);
```

## auth_token_blacklist

```sql
CREATE TABLE auth_token_blacklist (
    jti        TEXT    PRIMARY KEY,
    expires_at INTEGER NOT NULL
);
```

## auth_user

```sql
CREATE TABLE auth_user (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,           -- BCrypt 哈希，永不存明文
    roles         TEXT    NOT NULL DEFAULT 'USER',  -- 逗号分隔，如 'ADMIN,USER'
    enabled       INTEGER NOT NULL DEFAULT 1,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
, real_name TEXT);
```

## browser_request_ai_flow

```sql
CREATE TABLE browser_request_ai_flow (
    id           TEXT    PRIMARY KEY,
    session_id   TEXT    NOT NULL,
    name         TEXT    NOT NULL,
    instruction  TEXT,
    steps_json   TEXT    NOT NULL,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);
```

## browser_request_http_call

```sql
CREATE TABLE browser_request_http_call (
    id                  TEXT    PRIMARY KEY,
    recording_id        TEXT    NOT NULL,
    seq                 INTEGER NOT NULL,
    method              TEXT    NOT NULL,
    url                 TEXT    NOT NULL,
    resource_type       TEXT    NOT NULL,                -- XHR / FETCH / DOCUMENT / SCRIPT
    request_headers     TEXT,                            -- JSON
    request_body        TEXT,
    status              INTEGER,
    response_headers    TEXT,                            -- JSON
    response_body       TEXT,
    response_truncated  INTEGER NOT NULL DEFAULT 0,
    sensitive           INTEGER NOT NULL DEFAULT 0,
    started_at          INTEGER NOT NULL,
    elapsed_ms          INTEGER,
    initiator           TEXT
);
```

## browser_request_recording

```sql
CREATE TABLE browser_request_recording (
    id              TEXT    PRIMARY KEY,
    session_id      TEXT    NOT NULL,
    name            TEXT    NOT NULL,
    status          TEXT    NOT NULL,                    -- RECORDING / STOPPED / ABANDONED / AUTO_STOPPED
    capture_script  INTEGER NOT NULL DEFAULT 0,
    started_at      INTEGER NOT NULL,
    ended_at        INTEGER,
    call_count      INTEGER NOT NULL DEFAULT 0
);
```

## browser_request_session

```sql
CREATE TABLE browser_request_session (
    id              TEXT    PRIMARY KEY,
    name            TEXT    NOT NULL,
    url             TEXT    NOT NULL,
    has_storage     INTEGER NOT NULL DEFAULT 0,
    last_active_at  INTEGER,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    engine          TEXT
);
```

## browser_request_task

```sql
CREATE TABLE browser_request_task (
    id            TEXT    PRIMARY KEY,
    session_id    TEXT    NOT NULL,
    recording_id  TEXT,                                  -- 可空：adhoc / 录制被删后置 NULL
    name          TEXT    NOT NULL,
    steps_json    TEXT    NOT NULL,
    params_json   TEXT    NOT NULL,
    options_json  TEXT,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
);
```

## browser_request_task_run

```sql
CREATE TABLE browser_request_task_run (
    id                 TEXT    PRIMARY KEY,
    task_id            TEXT    NOT NULL,
    status             TEXT    NOT NULL,                 -- RUNNING / DONE / FAILED / CANCELLED
    started_at         INTEGER NOT NULL,
    finished_at        INTEGER,
    inputs_json        TEXT,
    step_results_json  TEXT,
    error_message      TEXT
);
```

## claude_chat_pending_sql

```sql
CREATE TABLE claude_chat_pending_sql (
    session_id          TEXT PRIMARY KEY,
    title               TEXT,
    target_environment  TEXT,
    
    change_type         TEXT NOT NULL DEFAULT 'MIXED',
    sql_text            TEXT NOT NULL,
    
    status              TEXT NOT NULL DEFAULT 'PENDING',
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    executed_at         INTEGER
, ddl_evidence_status TEXT NOT NULL DEFAULT 'NOT_CHECKED', ddl_project TEXT, ddl_baseline_path TEXT, ddl_evidence_id TEXT, ddl_verified_tables TEXT, ddl_missing_tables TEXT, ddl_checked_at INTEGER);
```

## claude_chat_project_alias

```sql
CREATE TABLE claude_chat_project_alias (
    project_path    TEXT PRIMARY KEY,
    alias           TEXT NOT NULL,
    updated_at      INTEGER NOT NULL
);
```

## claude_chat_queued_message

```sql
CREATE TABLE claude_chat_queued_message (
    id                      TEXT PRIMARY KEY,
    session_id              TEXT NOT NULL,
    text                    TEXT NOT NULL DEFAULT '',
    display_text            TEXT,
    developer_instructions  TEXT,
    attachments_json        TEXT,
    created_at              INTEGER NOT NULL
);
```

## claude_chat_review_feedback

```sql
CREATE TABLE claude_chat_review_feedback (
    id                  TEXT PRIMARY KEY,
    review_space_id     TEXT NOT NULL,
    source_session_id   TEXT NOT NULL,
    review_session_id   TEXT NOT NULL,
    content             TEXT NOT NULL,
    source_message_id   TEXT,
    status              TEXT NOT NULL DEFAULT 'PENDING',
    created_at          INTEGER NOT NULL,
    handled_at          INTEGER,
    UNIQUE (review_space_id, source_message_id)
);
```

## claude_chat_review_space

```sql
CREATE TABLE claude_chat_review_space (
    id                  TEXT PRIMARY KEY,
    source_session_id   TEXT NOT NULL,
    review_session_id   TEXT NOT NULL UNIQUE,
    mode                TEXT NOT NULL,
    token_hash          TEXT NOT NULL UNIQUE,
    status              TEXT NOT NULL DEFAULT 'ACTIVE',
    title               TEXT NOT NULL,
    context_snapshot    TEXT,
    expires_at          INTEGER NOT NULL,
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL
);
```

## claude_chat_session

```sql
CREATE TABLE claude_chat_session (
    id              TEXT PRIMARY KEY,
    cwd             TEXT NOT NULL,
    title           TEXT,
    -- SDK 侧 session_id，用于 query({ resume }) 续跑历史会话
    sdk_session_id  TEXT,
    -- 会话引擎：claude / codex（既有库由迁移 bean 补列，旧行默认 claude）
    engine          TEXT DEFAULT 'claude',
    -- RUNNING / IDLE / INTERRUPTED / DONE
    status          TEXT NOT NULL,
    started_at      INTEGER NOT NULL,
    last_seen_at    INTEGER NOT NULL
, engines TEXT, engine_sessions TEXT, api_base_url TEXT, auth_token TEXT, group_name TEXT, codex_home TEXT, selected_model TEXT, codex_reasoning_effort TEXT, codex_speed TEXT DEFAULT 'default', execution_policy TEXT DEFAULT 'standard', subgroup_name TEXT, favorite INTEGER NOT NULL DEFAULT 0, consult_evidence_systems TEXT);
```

## claude_chat_session_alias

```sql
CREATE TABLE claude_chat_session_alias (
    sdk_session_id  TEXT PRIMARY KEY,
    alias           TEXT NOT NULL,
    updated_at      INTEGER NOT NULL
);
```

## claude_chat_session_custom_site

```sql
CREATE TABLE claude_chat_session_custom_site (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    title       TEXT NOT NULL,
    site_url    TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    create_time INTEGER NOT NULL,
    update_time INTEGER NOT NULL,
    UNIQUE (session_id, id)
);
```

## claude_chat_session_plan_state

```sql
CREATE TABLE claude_chat_session_plan_state (
    id              TEXT PRIMARY KEY,
    plan_expired    INTEGER NOT NULL DEFAULT 0,
    expired_at      INTEGER,
    unlocked_at     INTEGER,
    create_time     INTEGER NOT NULL,
    update_time     INTEGER NOT NULL
);
```

## claude_chat_session_project_directory

```sql
CREATE TABLE claude_chat_session_project_directory (
    id            TEXT PRIMARY KEY,
    session_id    TEXT NOT NULL,
    project_path  TEXT NOT NULL,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    create_time   INTEGER NOT NULL,
    update_time   INTEGER NOT NULL,
    UNIQUE(session_id, project_path)
);
```

## claude_chat_session_site

```sql
CREATE TABLE claude_chat_session_site (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    site_id     TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    create_time INTEGER NOT NULL,
    update_time INTEGER NOT NULL,
    UNIQUE (session_id, site_id)
);
```

## claude_chat_setting

```sql
CREATE TABLE claude_chat_setting (
    name        TEXT PRIMARY KEY,
    payload     TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
);
```

## consult_bug

```sql
CREATE TABLE consult_bug (
    bug_id             TEXT    PRIMARY KEY,              
    dedup_key          TEXT    NOT NULL,                 
    consult_session_id TEXT,                             
    dev_session_id     TEXT,                             
    system_name        TEXT,
    module             TEXT,
    role               TEXT,                             
    user_id            TEXT,
    title              TEXT    NOT NULL,                 
    type               TEXT,                             
    severity           TEXT,                             
    reproduce          TEXT,                             
    expected           TEXT,                             
    actual             TEXT,                             
    suspect_area       TEXT,                             
    evidence           TEXT,                             
    question           TEXT,                             
    answer             TEXT,                             
    ai_confidence      INTEGER,                          
    refs_json          TEXT,                             
    status             TEXT    NOT NULL DEFAULT 'NEW',
    occurrence_count   INTEGER NOT NULL DEFAULT 1,
    first_seen_at      INTEGER NOT NULL,
    last_seen_at       INTEGER NOT NULL,
    created_at         INTEGER NOT NULL,
    updated_at         INTEGER NOT NULL
);
```

## consult_evidence_route

```sql
CREATE TABLE consult_evidence_route (
    id                  TEXT    PRIMARY KEY,
    context_system      TEXT    NOT NULL,                 
    module_name         TEXT,                             
    business_object     TEXT    NOT NULL,                 
    keywords            TEXT,                             
    evidence_system     TEXT    NOT NULL,                 
    schema_source       TEXT    NOT NULL DEFAULT 'RUNTIME_METADATA',
    description         TEXT,
    evidence_refs       TEXT,                             
    status              TEXT    NOT NULL DEFAULT 'DRAFT', 
    source              TEXT    NOT NULL DEFAULT 'MANUAL',
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    confirmed_at        INTEGER
);
```

## consult_feedback

```sql
CREATE TABLE consult_feedback (
    session_id     TEXT    NOT NULL,                      
    turn_index     INTEGER NOT NULL,                      
    rating         TEXT    NOT NULL,                       
    category       TEXT,                                   
    reason         TEXT,                                   
    correct_answer TEXT,                                   
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    PRIMARY KEY (session_id, turn_index)
);
```

## consult_prompt

```sql
CREATE TABLE consult_prompt (
    id         TEXT    PRIMARY KEY,
    prompt_key TEXT    NOT NULL,                          
    version    INTEGER NOT NULL,                          
    content    TEXT    NOT NULL,
    note       TEXT,                                      
    active     INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);
```

## consult_session

```sql
CREATE TABLE consult_session (
    session_id          TEXT    PRIMARY KEY,              
    user_id             TEXT,                             
    system_name         TEXT    NOT NULL,                 
    system_source_path  TEXT    NOT NULL,                 
    module_names        TEXT,                             
    prompt_snapshot     TEXT,                             
    dev_session_id      TEXT,                             
    raw_reference_json  TEXT,                             
    parse_status        TEXT    DEFAULT 'NONE',           
    archive_status      TEXT    NOT NULL DEFAULT 'PENDING',
    error_msg           TEXT,                             
    created_at          INTEGER NOT NULL,                 
    ended_at            INTEGER                           
, role TEXT DEFAULT 'IT', question_title TEXT, engine TEXT NOT NULL DEFAULT 'codex', model TEXT, codex_reasoning_effort TEXT, codex_speed TEXT, codex_home TEXT, orchestration_version TEXT NOT NULL DEFAULT 'v1', evidence_systems TEXT, evidence_route_snapshot TEXT);
```

## consult_system_pref

```sql
CREATE TABLE consult_system_pref (
    system_name         TEXT    PRIMARY KEY,              
    system_source_path  TEXT,                             
    alias               TEXT,                             
    visible             INTEGER NOT NULL DEFAULT 1,       
    sort_order          INTEGER NOT NULL DEFAULT 0,       
    updated_at          INTEGER NOT NULL
);
```

## consult_topology_link

```sql
CREATE TABLE consult_topology_link (
    from_system  TEXT    NOT NULL,                        
    to_system    TEXT    NOT NULL,                        
    relation     TEXT,                                    
    description  TEXT,                                    
    created_at   INTEGER NOT NULL,                        
    PRIMARY KEY (from_system, to_system)
);
```

## consult_turn

```sql
CREATE TABLE consult_turn (
    turn_id              TEXT    PRIMARY KEY,             
    session_id           TEXT    NOT NULL,                
    turn_index           INTEGER NOT NULL,                
    question             TEXT,                            
    answer               TEXT,                            
    ref_menu_paths       TEXT,                            
    ref_graphify_nodes   TEXT,                            
    ref_domain_knowledge TEXT,                            
    created_at           INTEGER NOT NULL
, attachments TEXT, recognized_system_name TEXT, recognized_module_names TEXT, problem_category TEXT, recognition_status TEXT, recognition_evidence TEXT, trace_id TEXT);
```

## consult_turn_extraction

```sql
CREATE TABLE consult_turn_extraction (
    session_id     TEXT    NOT NULL,
    turn_index     INTEGER NOT NULL,
    answer_hash    TEXT    NOT NULL,               
    status         TEXT    NOT NULL,               
    is_bug         INTEGER,                        
    bug_id         TEXT,                           
    prompt_version INTEGER,                        
    raw            TEXT,                           
    error          TEXT,
    extracted_at   INTEGER NOT NULL,
    PRIMARY KEY (session_id, turn_index)
);
```

## consult_turn_trace

```sql
CREATE TABLE consult_turn_trace (
    turn_id       TEXT    PRIMARY KEY,
    session_id    TEXT    NOT NULL,
    turn_index    INTEGER NOT NULL,
    trace_id      TEXT,
    started_at    INTEGER NOT NULL,
    completed_at  INTEGER,
    UNIQUE (session_id, turn_index)
);
```

## doc_file_cache

```sql
CREATE TABLE doc_file_cache (
    sha          TEXT PRIMARY KEY,
    kind         TEXT NOT NULL,
    size         INTEGER NOT NULL,
    content      TEXT,
    cached_at    INTEGER NOT NULL
);
```

## doc_source

```sql
CREATE TABLE doc_source (
    id                 TEXT PRIMARY KEY,
    owner              TEXT NOT NULL,
    repo               TEXT NOT NULL,
    ref_name           TEXT NOT NULL,
    sub_path           TEXT NOT NULL DEFAULT '',
    ref_sha            TEXT NOT NULL,
    alias              TEXT NOT NULL,
    pat                TEXT,
    tree_etag          TEXT,
    rate_limit_until   INTEGER,
    last_refreshed_at  INTEGER NOT NULL,
    created_at         INTEGER NOT NULL
);
```

## doc_tree_cache

```sql
CREATE TABLE doc_tree_cache (
    source_id     TEXT NOT NULL,
    path          TEXT NOT NULL,
    name          TEXT NOT NULL,
    kind          TEXT NOT NULL,
    sha           TEXT NOT NULL,
    size          INTEGER,
    parent_path   TEXT NOT NULL DEFAULT '',
    depth         INTEGER NOT NULL,
    PRIMARY KEY (source_id, path)
);
```

## docker_app

```sql
CREATE TABLE docker_app (
    id           TEXT PRIMARY KEY,
    host_id      TEXT NOT NULL,
    name         TEXT NOT NULL,
    base_dir     TEXT NOT NULL,
    compose_file TEXT NOT NULL DEFAULT 'docker-compose.yml',
    note         TEXT,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);
```

## dynamic_config_override

```sql
CREATE TABLE dynamic_config_override (
    config_key TEXT    PRIMARY KEY,
    value      TEXT    NOT NULL,
    updated_at INTEGER NOT NULL
);
```

## eval_case

```sql
CREATE TABLE eval_case (
    id            TEXT    PRIMARY KEY,          
    scenario      TEXT    NOT NULL,             
    dataset       TEXT    NOT NULL,             
    title         TEXT    NOT NULL,
    input_json    TEXT    NOT NULL,             
    expected_json TEXT    NOT NULL,             
    assert_json   TEXT,                         
    tags          TEXT,                         
    source_ref    TEXT,                         
    enabled       INTEGER NOT NULL DEFAULT 1,   
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
);
```

## eval_prompt

```sql
CREATE TABLE eval_prompt (
    id         TEXT    PRIMARY KEY,
    prompt_key TEXT    NOT NULL,                
    version    INTEGER NOT NULL,                
    content    TEXT    NOT NULL,
    note       TEXT,
    active     INTEGER NOT NULL DEFAULT 0,      
    created_at INTEGER NOT NULL
);
```

## eval_result

```sql
CREATE TABLE eval_result (
    id              TEXT    PRIMARY KEY,
    run_id          TEXT    NOT NULL,
    case_id         TEXT    NOT NULL,
    case_title      TEXT,                       
    verdict         TEXT    NOT NULL,
    score           REAL    NOT NULL DEFAULT 0, 
    output_json     TEXT,                       
    raw_output      TEXT,                       
    assertions_json TEXT,                       
    error           TEXT,
    latency_ms      INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL
, trace_id TEXT, score_export_status TEXT NOT NULL DEFAULT 'SKIPPED', score_export_error TEXT, score_exported_at INTEGER);
```

## eval_run

```sql
CREATE TABLE eval_run (
    id             TEXT    PRIMARY KEY,
    scenario       TEXT    NOT NULL,
    dataset        TEXT    NOT NULL,
    adapter        TEXT    NOT NULL,            
    model          TEXT,                        
    prompt_key     TEXT,
    prompt_version INTEGER,
    status         TEXT    NOT NULL DEFAULT 'RUNNING',
    total          INTEGER NOT NULL DEFAULT 0,
    passed         INTEGER NOT NULL DEFAULT 0,
    failed         INTEGER NOT NULL DEFAULT 0,
    errored        INTEGER NOT NULL DEFAULT 0,  
    note           TEXT,
    error          TEXT,                        
    started_at     INTEGER NOT NULL,
    finished_at    INTEGER
);
```

## feature_config

```sql
CREATE TABLE feature_config (
    feature_id  TEXT PRIMARY KEY,
    value_json  TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
);
```

## flatten_file

```sql
CREATE TABLE flatten_file (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id           TEXT NOT NULL,
    path              TEXT NOT NULL,
    name              TEXT NOT NULL,
    size              INTEGER NOT NULL,
    hash              TEXT,
    modified_at       INTEGER NOT NULL,
    deleted           INTEGER NOT NULL DEFAULT 0,
    target_name       TEXT,
    moved             INTEGER NOT NULL DEFAULT 0
);
```

## flatten_scan

```sql
CREATE TABLE flatten_scan (
    id                TEXT PRIMARY KEY,
    source_path       TEXT NOT NULL,
    target_path       TEXT NOT NULL,
    status            TEXT NOT NULL,
    started_at        INTEGER NOT NULL,
    finished_at       INTEGER,
    total_files       INTEGER NOT NULL DEFAULT 0,
    total_size        INTEGER NOT NULL DEFAULT 0,
    duplicate_groups  INTEGER NOT NULL DEFAULT 0,
    duplicate_files   INTEGER NOT NULL DEFAULT 0,
    duplicate_size    INTEGER NOT NULL DEFAULT 0,
    files_to_move     INTEGER NOT NULL DEFAULT 0,
    moved_files       INTEGER NOT NULL DEFAULT 0,
    error_msg         TEXT
);
```

## forge_audit_log

```sql
CREATE TABLE forge_audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    operator_id INTEGER NOT NULL,                    -- 操作人 user_id
    action      TEXT    NOT NULL,                    -- ROLE_UPDATE/ROLE_PERM_BIND/USER_ROLE_ASSIGN 等
    target_type TEXT    NOT NULL,
    target_id   TEXT,
    detail      TEXT,                                -- 变更前后快照（JSON）
    created_at  INTEGER NOT NULL
);
```

## forge_department

```sql
CREATE TABLE forge_department (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id  INTEGER NOT NULL DEFAULT 0,          -- 父部门 id，0=根
    name       TEXT    NOT NULL,
    code       TEXT,                                 -- 部门编码，可空；非空时唯一
    sort       INTEGER NOT NULL DEFAULT 0,           -- 同级排序
    status     TEXT    NOT NULL DEFAULT 'ENABLED',   -- ENABLED/DISABLED
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
```

## forge_permission

```sql
CREATE TABLE forge_permission (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT    NOT NULL UNIQUE,             -- 如 forge:role:menu、tool-downloader:btn:delete
    name        TEXT    NOT NULL,
    type        TEXT    NOT NULL,                    -- MENU/BUTTON
    module      TEXT    NOT NULL,                    -- 所属 feature，如 forge
    parent_code TEXT,                                -- 分组展示用
    sort        INTEGER NOT NULL DEFAULT 0,
    status      TEXT    NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE/DEPRECATED（同步失效标记）
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);
```

## forge_role

```sql
CREATE TABLE forge_role (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    code            TEXT    NOT NULL UNIQUE,          -- 角色编码，如 ADMIN、role_tool_user
    description     TEXT,
    builtin         INTEGER NOT NULL DEFAULT 0,       -- 1=内置
    data_scope_type TEXT    NOT NULL DEFAULT 'SELF',  -- 数据权限槽位 ALL/DEPT/SELF/CUSTOM（本期仅存储）
    status          TEXT    NOT NULL DEFAULT 'ENABLED',
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);
```

## forge_role_permission

```sql
CREATE TABLE forge_role_permission (
    role_id       INTEGER NOT NULL,
    permission_id INTEGER NOT NULL,
    PRIMARY KEY (role_id, permission_id)
);
```

## forge_user_department

```sql
CREATE TABLE forge_user_department (
    user_id       INTEGER PRIMARY KEY,
    department_id INTEGER NOT NULL
);
```

## forge_user_role

```sql
CREATE TABLE forge_user_role (
    user_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, role_id)
);
```

## frp_host_target

```sql
CREATE TABLE frp_host_target (
    host_id      TEXT NOT NULL,
    mode         TEXT NOT NULL,
    install_dir  TEXT NOT NULL,
    config_json  TEXT,
    updated_at   INTEGER NOT NULL,
    PRIMARY KEY (host_id, mode)
);
```

## host

```sql
CREATE TABLE host (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    host           TEXT NOT NULL,
    port           INTEGER NOT NULL DEFAULT 22,
    username       TEXT NOT NULL,
    auth_type      TEXT NOT NULL,
    password       TEXT,
    private_key    TEXT,
    passphrase     TEXT,
    tag            TEXT,
    note           TEXT,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
);
```

## java8_example

```sql
CREATE TABLE java8_example (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            node_id TEXT NOT NULL,
            title TEXT NOT NULL,
            before_code TEXT NOT NULL DEFAULT '',
            after_code TEXT NOT NULL DEFAULT '',
            explanation TEXT NOT NULL DEFAULT '',
            create_time TEXT NOT NULL,
            update_time TEXT NOT NULL
        );
```

## java8_interview

```sql
CREATE TABLE java8_interview (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            node_id TEXT NOT NULL,
            question TEXT NOT NULL,
            short_answer TEXT NOT NULL DEFAULT '',
            detail_answer TEXT NOT NULL DEFAULT '',
            project_answer TEXT NOT NULL DEFAULT '',
            create_time TEXT NOT NULL,
            update_time TEXT NOT NULL
        );
```

## java8_node

```sql
CREATE TABLE java8_node (
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
```

## java8_relation

```sql
CREATE TABLE java8_relation (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id TEXT NOT NULL,
            target_id TEXT NOT NULL,
            relation_type TEXT NOT NULL,
            create_time TEXT NOT NULL,
            update_time TEXT NOT NULL,
            UNIQUE(source_id, target_id, relation_type)
        );
```

## kg_status_cache

```sql
CREATE TABLE kg_status_cache (
    project_path         TEXT PRIMARY KEY,
    graphify_state       TEXT,
    business_graph_state TEXT,
    business_error       TEXT,
    checked_at           TEXT NOT NULL
);
```

## llm_call_log

```sql
CREATE TABLE llm_call_log (
    id               TEXT PRIMARY KEY,
    created_at       TEXT    NOT NULL,           
    epoch_ms         INTEGER NOT NULL,           
    tier             TEXT    NOT NULL,
    model_id         TEXT    NOT NULL,           
    model_name       TEXT,                       
    tool_id          TEXT,                       
    agent            TEXT,                       
    stage            TEXT,                       
    input_tokens     INTEGER,
    output_tokens    INTEGER,
    total_tokens     INTEGER,
    tokens_estimated INTEGER NOT NULL DEFAULT 0, 
    cost             REAL    NOT NULL DEFAULT 0, 
    latency_ms       INTEGER NOT NULL DEFAULT 0,
    status           TEXT    NOT NULL,           
    finish_reason    TEXT,
    attempt          INTEGER NOT NULL DEFAULT 1, 
    error_type       TEXT,
    error_message    TEXT,
    request_chars    INTEGER NOT NULL DEFAULT 0,
    response_chars   INTEGER NOT NULL DEFAULT 0
);
```

## local_doc_source

```sql
CREATE TABLE local_doc_source (
    id                 TEXT PRIMARY KEY,
    alias              TEXT NOT NULL,
    root_path          TEXT NOT NULL,
    last_visited_at    INTEGER NOT NULL,
    created_at         INTEGER NOT NULL
);
```

## mail_inbox

```sql
CREATE TABLE mail_inbox (
    id          TEXT    PRIMARY KEY,
    message_id  TEXT,
    from_addr   TEXT    NOT NULL,
    to_addr     TEXT    NOT NULL,
    subject     TEXT,
    body_text   TEXT,
    body_html   TEXT,
    attachments TEXT,
    received_at INTEGER NOT NULL,
    is_read     INTEGER NOT NULL DEFAULT 0,
    raw_size    INTEGER
);
```

## menu_visibility

```sql
CREATE TABLE menu_visibility (
    user_id          INTEGER PRIMARY KEY,
    visible_ids_json TEXT    NOT NULL,
    updated_at       INTEGER NOT NULL
);
```

## ops_datasource

```sql
CREATE TABLE ops_datasource (
    id          TEXT PRIMARY KEY,
    system_id   TEXT NOT NULL,
    env         TEXT NOT NULL,          
    type        TEXT NOT NULL,          
    name        TEXT NOT NULL,          
    host        TEXT NOT NULL,
    port        INTEGER NOT NULL,
    username    TEXT,
    password    TEXT,                   
    
    db_name     TEXT,
    
    params      TEXT,
    note        TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);
```

## ops_query_history

```sql
CREATE TABLE ops_query_history (
    id            TEXT PRIMARY KEY,
    datasource_id TEXT NOT NULL,
    kind          TEXT NOT NULL,        
    content       TEXT NOT NULL,        
    status        TEXT NOT NULL,        
    row_count     INTEGER,
    elapsed_ms    INTEGER,
    error_msg     TEXT,
    executed_at   INTEGER NOT NULL
, result_json TEXT);
```

## ops_system

```sql
CREATE TABLE ops_system (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,          
    code        TEXT,                   
    owner       TEXT,                   
    description TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);
```

## prd_doc_change_analysis_snapshot

```sql
CREATE TABLE prd_doc_change_analysis_snapshot (
    candidate_id                 TEXT PRIMARY KEY,
    repository_heads_json        TEXT NOT NULL DEFAULT '{}',
    workspace_snapshot_hash      TEXT NOT NULL,
    created_at                   INTEGER NOT NULL,
    FOREIGN KEY (candidate_id) REFERENCES prd_doc_change_candidate(id) ON DELETE CASCADE
);
```

## prd_doc_change_baseline

```sql
CREATE TABLE prd_doc_change_baseline (
    prd_session_id               TEXT NOT NULL,
    dev_session_id               TEXT NOT NULL,
    conversation_seq             INTEGER NOT NULL DEFAULT 0,
    repository_heads_json        TEXT NOT NULL DEFAULT '{}',
    workspace_snapshot_hash      TEXT NOT NULL,
    prd_hash                     TEXT NOT NULL,
    tdd_hash                     TEXT NOT NULL,
    updated_at                   INTEGER NOT NULL,
    PRIMARY KEY (prd_session_id, dev_session_id),
    FOREIGN KEY (prd_session_id) REFERENCES prd_session(id) ON DELETE CASCADE
);
```

## prd_doc_change_candidate

```sql
CREATE TABLE prd_doc_change_candidate (
    id                          TEXT PRIMARY KEY,
    prd_session_id              TEXT NOT NULL,
    dev_session_id              TEXT NOT NULL,
    conversation_from_seq       INTEGER NOT NULL DEFAULT 0,
    conversation_to_seq         INTEGER NOT NULL DEFAULT 0,
    code_snapshot_hash          TEXT NOT NULL,
    decision                    TEXT NOT NULL,
    ai_decision                 TEXT NOT NULL,
    summary                     TEXT,
    reasoning                   TEXT,
    evidence_json               TEXT,
    prd_patch_plan_json         TEXT,
    tdd_patch_plan_json         TEXT,
    risks_json                  TEXT,
    clarification_question      TEXT,
    clarification_history_json  TEXT,
    confidence                  INTEGER NOT NULL DEFAULT 0,
    status                      TEXT NOT NULL DEFAULT 'PENDING',
    apply_stage                 TEXT NOT NULL DEFAULT 'NONE',
    last_error                  TEXT,
    prd_applied_at              INTEGER,
    tdd_applied_at              INTEGER,
    created_at                  INTEGER NOT NULL,
    updated_at                  INTEGER NOT NULL, change_cause_type TEXT, change_cause_detail TEXT, revision_session_id TEXT, diff_ledger_json TEXT NOT NULL DEFAULT '[]', alignment_conclusion_json TEXT NOT NULL DEFAULT '{}', verified_at INTEGER,
    FOREIGN KEY (prd_session_id) REFERENCES prd_session(id) ON DELETE CASCADE
);
```

## prd_session

```sql
CREATE TABLE prd_session (
    id          TEXT    PRIMARY KEY,            
    title       TEXT    NOT NULL,               
    project     TEXT,                           
    module      TEXT,                           
    raw_input   TEXT    NOT NULL,               
    questions   TEXT,                           
    status      TEXT    NOT NULL DEFAULT 'CLARIFYING',
    md_path     TEXT,                           
    model       TEXT,                           
    error_msg   TEXT,                           
    created_at  INTEGER NOT NULL,               
    updated_at  INTEGER NOT NULL
, role TEXT NOT NULL DEFAULT 'PRODUCT', dev_doc_path TEXT, dev_session_id TEXT, dev_doc_generated_at INTEGER, req_type TEXT NOT NULL DEFAULT 'NEW_MODULE', max_questions INTEGER NOT NULL DEFAULT 5, dev_doc_history TEXT, dev_doc_estimation TEXT, created_by_user_id INTEGER, clarify_mode TEXT NOT NULL DEFAULT 'progressive', progress_path TEXT, progress_generated_at INTEGER, progress_history TEXT, parent_id TEXT, requirement_detail TEXT, business_background TEXT, business_requirement_type TEXT, requirement_software TEXT, initiating_department TEXT, requester TEXT, requested_at TEXT, source_attachments TEXT, follow_up_records TEXT, engine TEXT, dev_doc_qa_draft TEXT, dev_doc_work_status TEXT, dev_doc_work_error TEXT, prd_questions_generated_at INTEGER, prd_generated_at INTEGER, dev_doc_questions_generated_at INTEGER, document_profile TEXT NOT NULL DEFAULT 'CLASSIC');
```

## quick_launch_site

```sql
CREATE TABLE quick_launch_site (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    site_url        TEXT NOT NULL,
    group_name      TEXT NOT NULL DEFAULT '未分组',
    icon            TEXT NOT NULL DEFAULT 'Globe2',
    open_mode       TEXT NOT NULL DEFAULT 'POPUP'
                    CHECK (open_mode IN ('POPUP', 'TAB', 'CURRENT')),
    window_width    INTEGER NOT NULL DEFAULT 1400,
    window_height   INTEGER NOT NULL DEFAULT 900,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    pinned          INTEGER NOT NULL DEFAULT 0,
    enabled         INTEGER NOT NULL DEFAULT 1,
    open_count      INTEGER NOT NULL DEFAULT 0,
    last_opened_at  INTEGER,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
, window_behavior TEXT NOT NULL DEFAULT 'STANDARD');
```

## req_pool_item

```sql
CREATE TABLE req_pool_item (
    id             TEXT    PRIMARY KEY,             
    title          TEXT    NOT NULL,                
    description    TEXT,                            
    project        TEXT,                            
    module         TEXT,                            
    priority       TEXT    NOT NULL DEFAULT 'MEDIUM',
    status         TEXT    NOT NULL DEFAULT 'DRAFT',
    assignee       TEXT,                            
    deadline       TEXT,                            
    prd_session_id TEXT,                            
    tags           TEXT,                            
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
, ai_insight TEXT, assignee_user_id INTEGER);
```

## req_pool_prd_exclusion

```sql
CREATE TABLE req_pool_prd_exclusion (
    prd_session_id TEXT PRIMARY KEY,
    excluded_at    INTEGER NOT NULL
);
```

## resume_kv

```sql
CREATE TABLE resume_kv (
    key_name   TEXT    PRIMARY KEY,
    value_json TEXT    NOT NULL,
    updated_at INTEGER NOT NULL
);
```

## srm_dev_config_change

```sql
CREATE TABLE srm_dev_config_change (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL,
    config_key  TEXT NOT NULL,
    scope       TEXT,
    old_value   TEXT,
    new_value   TEXT,
    remark      TEXT,
    
    applied     INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);
```

## srm_dev_sql_change

```sql
CREATE TABLE srm_dev_sql_change (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL,
    title       TEXT,
    db_name     TEXT,
    
    change_type TEXT,
    sql_text    TEXT NOT NULL,
    author      TEXT,
    
    executed    INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);
```

## srm_dev_task

```sql
CREATE TABLE srm_dev_task (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    module_name TEXT,
    requirement TEXT,
    owner       TEXT,
    
    status      TEXT NOT NULL DEFAULT 'open',
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);
```

## subtitle_job

```sql
CREATE TABLE subtitle_job (
    id               TEXT PRIMARY KEY,
    scan_id          TEXT NOT NULL,
    video_path       TEXT NOT NULL,
    video_path_hash  TEXT NOT NULL,
    status           TEXT NOT NULL,
    model            TEXT NOT NULL,
    source_language  TEXT,
    progress         REAL NOT NULL DEFAULT 0,
    vtt_path             TEXT,
    translated_vtt_path  TEXT,
    -- User-supplied whisper --prompt seed (proper nouns / domain vocabulary). Stored so a
    -- regenerate request can prefill the input with what produced the prior VTT.
    initial_prompt       TEXT,
    error_msg            TEXT,
    created_at           INTEGER NOT NULL,
    started_at           INTEGER,
    finished_at          INTEGER
);
```

## tool_downloader_segment

```sql
CREATE TABLE tool_downloader_segment (
    task_id                 INTEGER NOT NULL,
    seq_no                  INTEGER NOT NULL,
    offset_bytes            INTEGER NOT NULL,
    length_bytes            INTEGER NOT NULL,
    bytes_downloaded        INTEGER NOT NULL DEFAULT 0,
    state                   TEXT    NOT NULL,                    -- PENDING/DOWNLOADING/DONE/FAILED
    attempts                INTEGER NOT NULL DEFAULT 0,
    last_error              TEXT,
    PRIMARY KEY (task_id, seq_no),
    FOREIGN KEY (task_id) REFERENCES tool_downloader_task(id) ON DELETE CASCADE
);
```

## tool_downloader_task

```sql
CREATE TABLE tool_downloader_task (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    url                     TEXT    NOT NULL,
    save_path               TEXT    NOT NULL,
    filename                TEXT    NOT NULL,
    total_size              INTEGER NOT NULL DEFAULT -1,         -- -1 表示未知
    accept_ranges           INTEGER NOT NULL DEFAULT 0,          -- 0/1
    state                   TEXT    NOT NULL,                    -- QUEUED/PROBING/DOWNLOADING/PAUSED/COMPLETED/FAILED
    route_type              TEXT,                                -- DIRECT/PROXY/NULL
    route_proxy             TEXT,                                -- http://host:port
    probe_direct_ttfb_ms    INTEGER,
    probe_direct_bps        INTEGER,
    probe_proxy_ttfb_ms     INTEGER,
    probe_proxy_bps         INTEGER,
    last_error              TEXT,
    http_engine             TEXT    NOT NULL DEFAULT 'JDK',      -- JDK / OKHTTP
    created_at              TEXT    NOT NULL,                    -- ISO-8601 UTC
    updated_at              TEXT    NOT NULL
);
```

## tool_java8gu_enrich

```sql
CREATE TABLE tool_java8gu_enrich (
    id          TEXT NOT NULL,              
    hash        TEXT NOT NULL,              
    payload     TEXT NOT NULL,              
    model       TEXT,                       
    created_at  TEXT NOT NULL,              
    PRIMARY KEY (id, hash)
);
```

## treesize_node

```sql
CREATE TABLE treesize_node (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id      TEXT NOT NULL,
    parent_path  TEXT,
    path         TEXT NOT NULL,
    name         TEXT NOT NULL,
    is_dir       INTEGER NOT NULL,
    size         INTEGER NOT NULL,
    file_count   INTEGER NOT NULL DEFAULT 0,
    dir_count    INTEGER NOT NULL DEFAULT 0,
    depth        INTEGER NOT NULL,
    -- ext: lowercase file extension without the leading dot, NULL for directories
    -- (TreeSizeMigration adds this column on pre-existing databases)
    ext          TEXT
);
```

## treesize_node_meta

```sql
CREATE TABLE treesize_node_meta (
    scan_id      TEXT NOT NULL,
    path         TEXT NOT NULL,
    modified_at  INTEGER,
    PRIMARY KEY (scan_id, path)
);
```

## treesize_scan

```sql
CREATE TABLE treesize_scan (
    id           TEXT PRIMARY KEY,
    root_path    TEXT NOT NULL,
    status       TEXT NOT NULL,
    started_at   INTEGER NOT NULL,
    finished_at  INTEGER,
    total_files  INTEGER NOT NULL DEFAULT 0,
    total_dirs   INTEGER NOT NULL DEFAULT 0,
    total_size   INTEGER NOT NULL DEFAULT 0,
    error_msg    TEXT
);
```

## treesize_scan_source

```sql
CREATE TABLE treesize_scan_source (
    scan_id       TEXT PRIMARY KEY,
    source_type   TEXT NOT NULL,
    ssh_host_id   TEXT,
    display_name  TEXT
);
```

## treesize_ssh_host

```sql
CREATE TABLE treesize_ssh_host (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    host           TEXT NOT NULL,
    port           INTEGER NOT NULL DEFAULT 22,
    username       TEXT NOT NULL,
    auth_type      TEXT NOT NULL,
    password       TEXT,
    private_key    TEXT,
    passphrase     TEXT,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
);
```

## treesize_video

```sql
CREATE TABLE treesize_video (
    -- 标识
    path                          TEXT PRIMARY KEY,
    -- basic
    name                          TEXT NOT NULL,
    parent_path                   TEXT,
    ext                           TEXT,
    size                          INTEGER NOT NULL,
    source_scan_id                TEXT,
    first_synced_at               INTEGER NOT NULL,
    last_synced_at                INTEGER NOT NULL,
    -- media
    duration_s                    REAL,
    duration_bucket               TEXT,
    width                         INTEGER,
    height                        INTEGER,
    video_codec                   TEXT,
    audio_codec                   TEXT,
    audio_lang_tag                TEXT,
    -- language
    language                      TEXT,
    language_confidence           REAL,
    language_detected_at          INTEGER,
    -- thumbnail_grid
    thumbnail_grid_path           TEXT,
    thumbnail_grid_generated_at   INTEGER,
    -- person_age
    person_main_age_group         TEXT,
    person_main_age               INTEGER,
    person_main_gender            TEXT,
    person_age_confidence         REAL,
    person_age_detected_at        INTEGER,
    person_age_reason             TEXT,
    -- series
    series_signature              TEXT,
    series_episode                INTEGER,
    -- visual_cluster
    visual_cluster_id             INTEGER,
    visual_cluster_label          TEXT,
    visual_clustered_at           INTEGER
);
```

## treesize_video_favorite

```sql
CREATE TABLE treesize_video_favorite (
    path        TEXT PRIMARY KEY,
    created_at  INTEGER NOT NULL
);
```

## treesize_video_recent

```sql
CREATE TABLE treesize_video_recent (
    path            TEXT PRIMARY KEY,
    last_access_at  INTEGER NOT NULL
);
```

## va_company_alias

```sql
CREATE TABLE va_company_alias (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_norm TEXT    NOT NULL,
    alias_norm     TEXT    NOT NULL,
    source         TEXT,                       
    created_at     INTEGER NOT NULL,
    UNIQUE(canonical_norm, alias_norm)
);
```

## va_company_cache

```sql
CREATE TABLE va_company_cache (
    company_norm  TEXT PRIMARY KEY,
    uscc          TEXT,
    industry      TEXT,
    biz_scope     TEXT,
    raw_json      TEXT,
    fetched_at    INTEGER NOT NULL
);
```

## va_competitor

```sql
CREATE TABLE va_competitor (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name_norm   TEXT NOT NULL,
    raw_name    TEXT,
    source      TEXT,
    note        TEXT,
    created_at  INTEGER NOT NULL
);
```

## va_cust_add_audit

```sql
CREATE TABLE va_cust_add_audit (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    flowcheckid            INTEGER NOT NULL,           
    apply_no               INTEGER,                    
    apply_title            TEXT,                       
    applicant              TEXT,                       
    apply_dept             TEXT,                       
    make_date              INTEGER,                    
    make_date_raw          TEXT,                       
    customerup_apply_logid INTEGER,                    
    company_brand_name     TEXT,                       
    customer_name          TEXT,                       
    checkin_address        TEXT,                       
    customer_address       TEXT,                       
    analyze_status         TEXT    NOT NULL DEFAULT 'PENDING',
    verdict_id             INTEGER,                    
    visitor_id             INTEGER,                    
    identity               TEXT,                       
    relationship           TEXT,                       
    confidence             REAL,                       
    is_duplicate           INTEGER,                    
    dup_cust_id            INTEGER,                    
    needs_review           INTEGER NOT NULL DEFAULT 0, 
    analyze_error          TEXT,                       
    fetched_at             INTEGER NOT NULL,           
    analyzed_at            INTEGER,                    
    created_at             INTEGER NOT NULL
, erp_feedback_correct INTEGER, erp_feedback_reason TEXT, erp_corrected_identity TEXT, erp_corrected_relationship TEXT, erp_feedback_operator TEXT, erp_feedback_at INTEGER);
```

## va_customer

```sql
CREATE TABLE va_customer (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT,
    phone         TEXT,
    phone_norm    TEXT,
    company       TEXT,
    company_norm  TEXT,
    addr_norm     TEXT,                        
    status        TEXT,
    last_deal_at  INTEGER,
    created_at    INTEGER NOT NULL
);
```

## va_customer_ref

```sql
CREATE TABLE va_customer_ref (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    cust_id       INTEGER,                     
    cust_name     TEXT,                        
    keyword       TEXT,                        
    brand_name    TEXT,                        
    cust_type     TEXT,                        
    cust_category TEXT,                        
    biz_major     TEXT,                        
    province      TEXT,
    city          TEXT,
    district      TEXT,
    cust_addr     TEXT,                        
    checkin_addr  TEXT,                        
    lng           REAL,                        
    lat           REAL,                        
    level         TEXT,                        
    cust_property TEXT,                        
    creator       TEXT,                        
    note          TEXT,                        
    name_norm     TEXT,                        
    keyword_norm  TEXT,                        
    addr_norm     TEXT,                        
    created_at    INTEGER NOT NULL
, synced_at INTEGER, tel TEXT, tel_norm TEXT, contact_mobile TEXT, contact_mobile_norm TEXT, src_lastdate INTEGER);
```

## va_feedback

```sql
CREATE TABLE va_feedback (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    verdict_id            INTEGER NOT NULL,
    corrected_identity    TEXT,
    corrected_relationship TEXT,
    operator              TEXT,
    note                  TEXT,
    created_at            INTEGER NOT NULL
);
```

## va_verdict

```sql
CREATE TABLE va_verdict (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id    INTEGER,
    identity      TEXT NOT NULL,
    relationship  TEXT,
    confidence    REAL NOT NULL,
    decided_by    TEXT NOT NULL,
    rationale     TEXT,
    evidence_json TEXT,
    model         TEXT,
    needs_review  INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
);
```

## va_visitor

```sql
CREATE TABLE va_visitor (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT,
    phone         TEXT,
    phone_norm    TEXT,
    company       TEXT,
    company_norm  TEXT,
    company_addr  TEXT,
    addr_norm     TEXT,                        
    email         TEXT,
    purpose       TEXT,
    source        TEXT,
    created_at    INTEGER NOT NULL
);
```

## video_condense_job

```sql
CREATE TABLE video_condense_job (
    id           TEXT PRIMARY KEY,
    input_path   TEXT NOT NULL,
    status       TEXT NOT NULL,           -- JobStatus.name()
    duration_sec REAL,                    -- 探测时长（秒），未知为 NULL
    curve_json   TEXT,                    -- List<SegmentView> JSON；ANALYZED 后有值
    error        TEXT,                    -- FAILED 时简短原因
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);
```

## video_embedding

```sql
CREATE TABLE video_embedding (
    path           TEXT PRIMARY KEY,
    model          TEXT NOT NULL,
    dim            INTEGER NOT NULL,
    vector         BLOB NOT NULL,
    generated_at   INTEGER NOT NULL
);
```

## video_processing_job

```sql
CREATE TABLE video_processing_job (
    id              TEXT PRIMARY KEY,
    type            TEXT NOT NULL,
    status          TEXT NOT NULL,
    total           INTEGER NOT NULL DEFAULT 0,
    processed       INTEGER NOT NULL DEFAULT 0,
    succeeded       INTEGER NOT NULL DEFAULT 0,
    failed          INTEGER NOT NULL DEFAULT 0,
    current_path    TEXT,
    error_msg       TEXT,
    started_at      INTEGER NOT NULL,
    finished_at     INTEGER
);
```

## video_share

```sql
CREATE TABLE video_share (
    token          TEXT PRIMARY KEY,
    scan_id        TEXT NOT NULL,
    path           TEXT NOT NULL,
    name           TEXT NOT NULL,
    size           INTEGER NOT NULL DEFAULT 0,
    created_at     INTEGER NOT NULL,
    expires_at     INTEGER NOT NULL,
    revoked        INTEGER NOT NULL DEFAULT 0,
    hit_count      INTEGER NOT NULL DEFAULT 0,
    last_access_at INTEGER
);
```

## webterm_claude_session

```sql
CREATE TABLE webterm_claude_session (
    id            TEXT PRIMARY KEY,
    cwd           TEXT NOT NULL,
    shell         TEXT NOT NULL,
    title         TEXT,
    started_at    INTEGER NOT NULL,
    last_seen_at  INTEGER NOT NULL
);
```

## wechat_message

```sql
CREATE TABLE wechat_message (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    chat        TEXT,
    sender      TEXT,
    content     TEXT,
    type        TEXT,
    sent_time   TEXT,
    msg_id      TEXT,
    created_at  INTEGER NOT NULL
);
```

## welfare_sign_config

```sql
CREATE TABLE welfare_sign_config (
    id                 INTEGER PRIMARY KEY CHECK (id = 1),
    login_mode         TEXT    NOT NULL DEFAULT 'SMS',
    redirect_url       TEXT,
    login_image_url    TEXT,
    detail_image_url   TEXT,
    detail_title       TEXT    NOT NULL DEFAULT '节假日福利签收',
    detail_content     TEXT,
    popup_enabled      INTEGER NOT NULL DEFAULT 0,
    popup_title        TEXT,
    popup_content      TEXT,
    signature_notice   TEXT,
    extra_fields_json  TEXT,
    updated_at         INTEGER NOT NULL
);
```

## welfare_sign_employee

```sql
CREATE TABLE welfare_sign_employee (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_no   TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    phone         TEXT,
    account       TEXT,
    password      TEXT,
    department    TEXT,
    extra_json    TEXT,
    enabled       INTEGER NOT NULL DEFAULT 1,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
);
```

## welfare_sign_record

```sql
CREATE TABLE welfare_sign_record (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id     INTEGER NOT NULL,
    employee_no     TEXT    NOT NULL,
    name            TEXT    NOT NULL,
    phone           TEXT,
    department      TEXT,
    signature_data  TEXT    NOT NULL,
    extra_json      TEXT,
    signed_at       INTEGER NOT NULL,
    ip              TEXT,
    user_agent      TEXT
);
```

## workline_entry

```sql
CREATE TABLE workline_entry (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    line_id      INTEGER NOT NULL,
    parent_id    INTEGER,
    title        TEXT    NOT NULL,
    core_content TEXT,
    achievement  TEXT,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);
```

## workline_line

```sql
CREATE TABLE workline_line (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    description TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);
```

---

# Indexes

## idx_ai_chat_conv_updated

> 表：`ai_chat_conversation`

```sql
CREATE INDEX idx_ai_chat_conv_updated
    ON ai_chat_conversation(updated_at DESC);
```

## idx_ai_chat_msg_conv

> 表：`ai_chat_message`

```sql
CREATE INDEX idx_ai_chat_msg_conv
    ON ai_chat_message(conversation_id, created_at);
```

## idx_ai_flow_session

> 表：`browser_request_ai_flow`

```sql
CREATE INDEX idx_ai_flow_session ON browser_request_ai_flow(session_id, updated_at DESC);
```

## idx_ai_secretary_attachment_note

> 表：`ai_secretary_attachment`

```sql
CREATE INDEX idx_ai_secretary_attachment_note ON ai_secretary_attachment(note_id);
```

## idx_ai_secretary_memory_key

> 表：`ai_secretary_memory`

```sql
CREATE INDEX idx_ai_secretary_memory_key    ON ai_secretary_memory(category, mem_key);
```

## idx_ai_secretary_memory_status

> 表：`ai_secretary_memory`

```sql
CREATE INDEX idx_ai_secretary_memory_status ON ai_secretary_memory(status, category);
```

## idx_ai_secretary_note_category

> 表：`ai_secretary_note`

```sql
CREATE INDEX idx_ai_secretary_note_category ON ai_secretary_note(category, created_at);
```

## idx_ai_secretary_note_created

> 表：`ai_secretary_note`

```sql
CREATE INDEX idx_ai_secretary_note_created  ON ai_secretary_note(created_at);
```

## idx_auth_blacklist_exp

> 表：`auth_token_blacklist`

```sql
CREATE INDEX idx_auth_blacklist_exp ON auth_token_blacklist(expires_at);
```

## idx_auth_refresh_user

> 表：`auth_refresh_token`

```sql
CREATE INDEX idx_auth_refresh_user ON auth_refresh_token(user_id);
```

## idx_auth_user_username

> 表：`auth_user`

```sql
CREATE INDEX idx_auth_user_username ON auth_user(username);
```

## idx_browser_request_session_updated

> 表：`browser_request_session`

```sql
CREATE INDEX idx_browser_request_session_updated ON browser_request_session(updated_at DESC);
```

## idx_call_recording

> 表：`browser_request_http_call`

```sql
CREATE INDEX idx_call_recording ON browser_request_http_call(recording_id, seq ASC);
```

## idx_claude_chat_queued_message_session

> 表：`claude_chat_queued_message`

```sql
CREATE INDEX idx_claude_chat_queued_message_session
    ON claude_chat_queued_message(session_id, created_at);
```

## idx_claude_chat_review_feedback_source

> 表：`claude_chat_review_feedback`

```sql
CREATE INDEX idx_claude_chat_review_feedback_source
    ON claude_chat_review_feedback(source_session_id, status, created_at DESC);
```

## idx_claude_chat_review_source

> 表：`claude_chat_review_space`

```sql
CREATE INDEX idx_claude_chat_review_source
    ON claude_chat_review_space(source_session_id, created_at DESC);
```

## idx_claude_chat_session_custom_site_session

> 表：`claude_chat_session_custom_site`

```sql
CREATE INDEX idx_claude_chat_session_custom_site_session
    ON claude_chat_session_custom_site(session_id, sort_order);
```

## idx_claude_chat_session_project_directory

> 表：`claude_chat_session_project_directory`

```sql
CREATE INDEX idx_claude_chat_session_project_directory
    ON claude_chat_session_project_directory(session_id, sort_order);
```

## idx_claude_chat_session_seen

> 表：`claude_chat_session`

```sql
CREATE INDEX idx_claude_chat_session_seen
    ON claude_chat_session(last_seen_at DESC);
```

## idx_claude_chat_session_site_session

> 表：`claude_chat_session_site`

```sql
CREATE INDEX idx_claude_chat_session_site_session
    ON claude_chat_session_site(session_id, sort_order);
```

## idx_consult_bug_created

> 表：`consult_bug`

```sql
CREATE INDEX idx_consult_bug_created ON consult_bug(created_at DESC);
```

## idx_consult_bug_dedup

> 表：`consult_bug`

```sql
CREATE INDEX idx_consult_bug_dedup   ON consult_bug(dedup_key);
```

## idx_consult_bug_status

> 表：`consult_bug`

```sql
CREATE INDEX idx_consult_bug_status  ON consult_bug(status);
```

## idx_consult_evidence_route_context

> 表：`consult_evidence_route`

```sql
CREATE INDEX idx_consult_evidence_route_context
    ON consult_evidence_route(context_system, status);
```

## idx_consult_evidence_route_evidence

> 表：`consult_evidence_route`

```sql
CREATE INDEX idx_consult_evidence_route_evidence
    ON consult_evidence_route(evidence_system, status);
```

## idx_consult_extraction_bug

> 表：`consult_turn_extraction`

```sql
CREATE INDEX idx_consult_extraction_bug ON consult_turn_extraction(bug_id);
```

## idx_consult_prompt_active

> 表：`consult_prompt`

```sql
CREATE INDEX idx_consult_prompt_active ON consult_prompt(prompt_key, active);
```

## idx_consult_session_created

> 表：`consult_session`

```sql
CREATE INDEX idx_consult_session_created ON consult_session(created_at DESC);
```

## idx_consult_session_dev

> 表：`consult_session`

```sql
CREATE INDEX idx_consult_session_dev     ON consult_session(dev_session_id);
```

## idx_consult_session_user

> 表：`consult_session`

```sql
CREATE INDEX idx_consult_session_user    ON consult_session(user_id);
```

## idx_consult_turn_session

> 表：`consult_turn`

```sql
CREATE INDEX idx_consult_turn_session    ON consult_turn(session_id, turn_index);
```

## idx_consult_turn_trace_trace

> 表：`consult_turn_trace`

```sql
CREATE INDEX idx_consult_turn_trace_trace ON consult_turn_trace(trace_id);
```

## idx_docker_app_host

> 表：`docker_app`

```sql
CREATE INDEX idx_docker_app_host ON docker_app(host_id);
```

## idx_downloader_segment_task

> 表：`tool_downloader_segment`

```sql
CREATE INDEX idx_downloader_segment_task ON tool_downloader_segment(task_id);
```

## idx_downloader_task_state

> 表：`tool_downloader_task`

```sql
CREATE INDEX idx_downloader_task_state ON tool_downloader_task(state);
```

## idx_eval_case_dataset

> 表：`eval_case`

```sql
CREATE INDEX idx_eval_case_dataset  ON eval_case(dataset);
```

## idx_eval_case_enabled

> 表：`eval_case`

```sql
CREATE INDEX idx_eval_case_enabled  ON eval_case(enabled);
```

## idx_eval_case_scenario

> 表：`eval_case`

```sql
CREATE INDEX idx_eval_case_scenario ON eval_case(scenario);
```

## idx_eval_prompt_active

> 表：`eval_prompt`

```sql
CREATE INDEX idx_eval_prompt_active ON eval_prompt(prompt_key, active);
```

## idx_eval_result_run

> 表：`eval_result`

```sql
CREATE INDEX idx_eval_result_run ON eval_result(run_id);
```

## idx_eval_result_score_export

> 表：`eval_result`

```sql
CREATE INDEX idx_eval_result_score_export ON eval_result(score_export_status);
```

## idx_eval_run_dataset

> 表：`eval_run`

```sql
CREATE INDEX idx_eval_run_dataset ON eval_run(dataset, started_at DESC);
```

## idx_eval_run_started

> 表：`eval_run`

```sql
CREATE INDEX idx_eval_run_started ON eval_run(started_at DESC);
```

## idx_flatten_file_active

> 表：`flatten_file`

```sql
CREATE INDEX idx_flatten_file_active ON flatten_file(scan_id, deleted);
```

## idx_flatten_file_hash

> 表：`flatten_file`

```sql
CREATE INDEX idx_flatten_file_hash ON flatten_file(scan_id, hash);
```

## idx_flatten_file_scan

> 表：`flatten_file`

```sql
CREATE INDEX idx_flatten_file_scan ON flatten_file(scan_id);
```

## idx_forge_audit_action

> 表：`forge_audit_log`

```sql
CREATE INDEX idx_forge_audit_action ON forge_audit_log(action);
```

## idx_forge_audit_operator

> 表：`forge_audit_log`

```sql
CREATE INDEX idx_forge_audit_operator ON forge_audit_log(operator_id);
```

## idx_forge_dept_parent

> 表：`forge_department`

```sql
CREATE INDEX idx_forge_dept_parent ON forge_department(parent_id);
```

## idx_forge_perm_module

> 表：`forge_permission`

```sql
CREATE INDEX idx_forge_perm_module ON forge_permission(module);
```

## idx_frp_perm

> 表：`forge_role_permission`

```sql
CREATE INDEX idx_frp_perm ON forge_role_permission(permission_id);
```

## idx_fud_dept

> 表：`forge_user_department`

```sql
CREATE INDEX idx_fud_dept ON forge_user_department(department_id);
```

## idx_fur_role

> 表：`forge_user_role`

```sql
CREATE INDEX idx_fur_role ON forge_user_role(role_id);
```

## idx_host_name

> 表：`host`

```sql
CREATE INDEX idx_host_name ON host(name);
```

## idx_java8_example_node

> 表：`java8_example`

```sql
CREATE INDEX idx_java8_example_node ON java8_example(node_id);
```

## idx_java8_interview_node

> 表：`java8_interview`

```sql
CREATE INDEX idx_java8_interview_node ON java8_interview(node_id);
```

## idx_java8_node_parent

> 表：`java8_node`

```sql
CREATE INDEX idx_java8_node_parent ON java8_node(parent_id, sort_order);
```

## idx_java8_node_type

> 表：`java8_node`

```sql
CREATE INDEX idx_java8_node_type ON java8_node(node_type);
```

## idx_java8_relation_source

> 表：`java8_relation`

```sql
CREATE INDEX idx_java8_relation_source ON java8_relation(source_id);
```

## idx_java8_relation_target

> 表：`java8_relation`

```sql
CREATE INDEX idx_java8_relation_target ON java8_relation(target_id);
```

## idx_java8gu_enrich_id

> 表：`tool_java8gu_enrich`

```sql
CREATE INDEX idx_java8gu_enrich_id ON tool_java8gu_enrich(id);
```

## idx_job_started

> 表：`video_processing_job`

```sql
CREATE INDEX idx_job_started     ON video_processing_job(started_at DESC);
```

## idx_job_type_status

> 表：`video_processing_job`

```sql
CREATE INDEX idx_job_type_status ON video_processing_job(type, status);
```

## idx_llm_call_log_created

> 表：`llm_call_log`

```sql
CREATE INDEX idx_llm_call_log_created  ON llm_call_log(created_at);
```

## idx_llm_call_log_epoch

> 表：`llm_call_log`

```sql
CREATE INDEX idx_llm_call_log_epoch    ON llm_call_log(epoch_ms);
```

## idx_llm_call_log_model

> 表：`llm_call_log`

```sql
CREATE INDEX idx_llm_call_log_model    ON llm_call_log(model_id, epoch_ms);
```

## idx_llm_call_log_status

> 表：`llm_call_log`

```sql
CREATE INDEX idx_llm_call_log_status   ON llm_call_log(status, epoch_ms);
```

## idx_llm_call_log_tier

> 表：`llm_call_log`

```sql
CREATE INDEX idx_llm_call_log_tier     ON llm_call_log(tier, epoch_ms);
```

## idx_llm_call_log_tool

> 表：`llm_call_log`

```sql
CREATE INDEX idx_llm_call_log_tool     ON llm_call_log(tool_id, epoch_ms);
```

## idx_mail_is_read

> 表：`mail_inbox`

```sql
CREATE INDEX idx_mail_is_read     ON mail_inbox(is_read);
```

## idx_mail_received_at

> 表：`mail_inbox`

```sql
CREATE INDEX idx_mail_received_at ON mail_inbox(received_at DESC);
```

## idx_mail_to_addr

> 表：`mail_inbox`

```sql
CREATE INDEX idx_mail_to_addr     ON mail_inbox(to_addr);
```

## idx_node_meta_modified

> 表：`treesize_node_meta`

```sql
CREATE INDEX idx_node_meta_modified ON treesize_node_meta(scan_id, modified_at);
```

## idx_node_scan_parent

> 表：`treesize_node`

```sql
CREATE INDEX idx_node_scan_parent ON treesize_node(scan_id, parent_path);
```

## idx_node_scan_path

> 表：`treesize_node`

```sql
CREATE INDEX idx_node_scan_path   ON treesize_node(scan_id, path);
```

## idx_node_size

> 表：`treesize_node`

```sql
CREATE INDEX idx_node_size        ON treesize_node(scan_id, parent_path, size);
```

## idx_node_video_ext_name

> 表：`treesize_node`

```sql
CREATE INDEX idx_node_video_ext_name ON treesize_node(is_dir, ext, name COLLATE NOCASE);
```

## idx_node_video_ext_size

> 表：`treesize_node`

```sql
CREATE INDEX idx_node_video_ext_size ON treesize_node(is_dir, ext, size);
```

## idx_ops_ds_system

> 表：`ops_datasource`

```sql
CREATE INDEX idx_ops_ds_system ON ops_datasource(system_id, env);
```

## idx_ops_ds_type

> 表：`ops_datasource`

```sql
CREATE INDEX idx_ops_ds_type   ON ops_datasource(type);
```

## idx_ops_hist_ds

> 表：`ops_query_history`

```sql
CREATE INDEX idx_ops_hist_ds ON ops_query_history(datasource_id, executed_at DESC);
```

## idx_prd_doc_candidate_latest

> 表：`prd_doc_change_candidate`

```sql
CREATE INDEX idx_prd_doc_candidate_latest
    ON prd_doc_change_candidate(prd_session_id, created_at DESC);
```

## idx_prd_doc_candidate_snapshot

> 表：`prd_doc_change_candidate`

```sql
CREATE UNIQUE INDEX idx_prd_doc_candidate_snapshot
    ON prd_doc_change_candidate(prd_session_id, dev_session_id, code_snapshot_hash);
```

## idx_prd_session_created

> 表：`prd_session`

```sql
CREATE INDEX idx_prd_session_created ON prd_session(created_at DESC);
```

## idx_prd_session_created_by

> 表：`prd_session`

```sql
CREATE INDEX idx_prd_session_created_by ON prd_session(created_by_user_id);
```

## idx_prd_session_parent

> 表：`prd_session`

```sql
CREATE INDEX idx_prd_session_parent ON prd_session(parent_id);
```

## idx_prd_session_status

> 表：`prd_session`

```sql
CREATE INDEX idx_prd_session_status  ON prd_session(status);
```

## idx_quick_launch_group_sort

> 表：`quick_launch_site`

```sql
CREATE INDEX idx_quick_launch_group_sort
    ON quick_launch_site(enabled, group_name, pinned DESC, sort_order, updated_at DESC);
```

## idx_quick_launch_recent

> 表：`quick_launch_site`

```sql
CREATE INDEX idx_quick_launch_recent
    ON quick_launch_site(enabled, last_opened_at DESC);
```

## idx_recording_active

> 表：`browser_request_recording`

```sql
CREATE UNIQUE INDEX idx_recording_active
    ON browser_request_recording(session_id) WHERE status = 'RECORDING';
```

## idx_recording_session

> 表：`browser_request_recording`

```sql
CREATE INDEX idx_recording_session ON browser_request_recording(session_id, started_at DESC);
```

## idx_req_pool_created

> 表：`req_pool_item`

```sql
CREATE INDEX idx_req_pool_created  ON req_pool_item(created_at DESC);
```

## idx_req_pool_priority

> 表：`req_pool_item`

```sql
CREATE INDEX idx_req_pool_priority ON req_pool_item(priority);
```

## idx_req_pool_status

> 表：`req_pool_item`

```sql
CREATE INDEX idx_req_pool_status   ON req_pool_item(status);
```

## idx_run_task

> 表：`browser_request_task_run`

```sql
CREATE INDEX idx_run_task ON browser_request_task_run(task_id, started_at DESC);
```

## idx_srm_dev_config_change_task

> 表：`srm_dev_config_change`

```sql
CREATE INDEX idx_srm_dev_config_change_task
    ON srm_dev_config_change(task_id, sort_order);
```

## idx_srm_dev_sql_change_task

> 表：`srm_dev_sql_change`

```sql
CREATE INDEX idx_srm_dev_sql_change_task
    ON srm_dev_sql_change(task_id, sort_order);
```

## idx_srm_dev_task_updated

> 表：`srm_dev_task`

```sql
CREATE INDEX idx_srm_dev_task_updated
    ON srm_dev_task(updated_at DESC);
```

## idx_subtitle_scan_path

> 表：`subtitle_job`

```sql
CREATE INDEX idx_subtitle_scan_path ON subtitle_job(scan_id, video_path);
```

## idx_subtitle_status

> 表：`subtitle_job`

```sql
CREATE INDEX idx_subtitle_status ON subtitle_job(status);
```

## idx_subtitle_video_hash

> 表：`subtitle_job`

```sql
CREATE UNIQUE INDEX idx_subtitle_video_hash ON subtitle_job(video_path_hash);
```

## idx_task_session

> 表：`browser_request_task`

```sql
CREATE INDEX idx_task_session ON browser_request_task(session_id, updated_at DESC);
```

## idx_tree_parent

> 表：`doc_tree_cache`

```sql
CREATE INDEX idx_tree_parent
    ON doc_tree_cache(source_id, parent_path);
```

## idx_treesize_scan_source_host

> 表：`treesize_scan_source`

```sql
CREATE INDEX idx_treesize_scan_source_host ON treesize_scan_source(ssh_host_id);
```

## idx_treesize_scan_source_type

> 表：`treesize_scan_source`

```sql
CREATE INDEX idx_treesize_scan_source_type ON treesize_scan_source(source_type);
```

## idx_treesize_ssh_host_name

> 表：`treesize_ssh_host`

```sql
CREATE INDEX idx_treesize_ssh_host_name ON treesize_ssh_host(name);
```

## idx_va_alias_alias_norm

> 表：`va_company_alias`

```sql
CREATE INDEX idx_va_alias_alias_norm ON va_company_alias(alias_norm);
```

## idx_va_alias_canonical

> 表：`va_company_alias`

```sql
CREATE INDEX idx_va_alias_canonical  ON va_company_alias(canonical_norm);
```

## idx_va_cust_add_audit_feedback

> 表：`va_cust_add_audit`

```sql
CREATE INDEX idx_va_cust_add_audit_feedback ON va_cust_add_audit(erp_feedback_correct);
```

## idx_va_cust_add_audit_make_date

> 表：`va_cust_add_audit`

```sql
CREATE INDEX idx_va_cust_add_audit_make_date ON va_cust_add_audit(make_date);
```

## idx_va_cust_add_audit_status

> 表：`va_cust_add_audit`

```sql
CREATE INDEX idx_va_cust_add_audit_status    ON va_cust_add_audit(analyze_status);
```

## idx_va_customer_addr_norm

> 表：`va_customer`

```sql
CREATE INDEX idx_va_customer_addr_norm    ON va_customer(addr_norm);
```

## idx_va_customer_company_norm

> 表：`va_customer`

```sql
CREATE INDEX idx_va_customer_company_norm ON va_customer(company_norm);
```

## idx_va_customer_phone_norm

> 表：`va_customer`

```sql
CREATE INDEX idx_va_customer_phone_norm   ON va_customer(phone_norm);
```

## idx_va_customer_ref_addr_norm

> 表：`va_customer_ref`

```sql
CREATE INDEX idx_va_customer_ref_addr_norm    ON va_customer_ref(addr_norm);
```

## idx_va_customer_ref_keyword_norm

> 表：`va_customer_ref`

```sql
CREATE INDEX idx_va_customer_ref_keyword_norm ON va_customer_ref(keyword_norm);
```

## idx_va_customer_ref_mobile_norm

> 表：`va_customer_ref`

```sql
CREATE INDEX idx_va_customer_ref_mobile_norm  ON va_customer_ref(contact_mobile_norm);
```

## idx_va_customer_ref_name_norm

> 表：`va_customer_ref`

```sql
CREATE INDEX idx_va_customer_ref_name_norm    ON va_customer_ref(name_norm);
```

## idx_va_customer_ref_tel_norm

> 表：`va_customer_ref`

```sql
CREATE INDEX idx_va_customer_ref_tel_norm     ON va_customer_ref(tel_norm);
```

## idx_va_feedback_verdict

> 表：`va_feedback`

```sql
CREATE INDEX idx_va_feedback_verdict ON va_feedback(verdict_id);
```

## idx_va_verdict_review

> 表：`va_verdict`

```sql
CREATE INDEX idx_va_verdict_review  ON va_verdict(needs_review);
```

## idx_va_verdict_visitor

> 表：`va_verdict`

```sql
CREATE INDEX idx_va_verdict_visitor ON va_verdict(visitor_id);
```

## idx_va_visitor_addr_norm

> 表：`va_visitor`

```sql
CREATE INDEX idx_va_visitor_addr_norm    ON va_visitor(addr_norm);
```

## idx_va_visitor_company_norm

> 表：`va_visitor`

```sql
CREATE INDEX idx_va_visitor_company_norm ON va_visitor(company_norm);
```

## idx_va_visitor_phone_norm

> 表：`va_visitor`

```sql
CREATE INDEX idx_va_visitor_phone_norm   ON va_visitor(phone_norm);
```

## idx_vcj_created

> 表：`video_condense_job`

```sql
CREATE INDEX idx_vcj_created ON video_condense_job(created_at);
```

## idx_vcj_status

> 表：`video_condense_job`

```sql
CREATE INDEX idx_vcj_status  ON video_condense_job(status);
```

## idx_video_cluster

> 表：`treesize_video`

```sql
CREATE INDEX idx_video_cluster         ON treesize_video(visual_cluster_id);
```

## idx_video_duration_bucket

> 表：`treesize_video`

```sql
CREATE INDEX idx_video_duration_bucket ON treesize_video(duration_bucket);
```

## idx_video_duration_null

> 表：`treesize_video`

```sql
CREATE INDEX idx_video_duration_null     ON treesize_video(size DESC) WHERE duration_s IS NULL;
```

## idx_video_duration_pending

> 表：`treesize_video`

```sql
CREATE INDEX idx_video_duration_pending ON treesize_video(size DESC) WHERE duration_bucket IS NULL;
```

## idx_video_embedding_model

> 表：`video_embedding`

```sql
CREATE INDEX idx_video_embedding_model ON video_embedding(model);
```

## idx_video_ext

> 表：`treesize_video`

```sql
CREATE INDEX idx_video_ext             ON treesize_video(ext);
```

## idx_video_grid_null

> 表：`treesize_video`

```sql
CREATE INDEX idx_video_grid_null         ON treesize_video(size DESC) WHERE thumbnail_grid_path IS NULL;
```

## idx_video_grid_pending

> 表：`treesize_video`

```sql
CREATE INDEX idx_video_grid_pending     ON treesize_video(size DESC) WHERE thumbnail_grid_generated_at IS NULL;
```

## idx_video_language

> 表：`treesize_video`

```sql
CREATE INDEX idx_video_language        ON treesize_video(language);
```

## idx_video_language_null

> 表：`treesize_video`

```sql
CREATE INDEX idx_video_language_null     ON treesize_video(size DESC) WHERE language IS NULL;
```

## idx_video_language_pending

> 表：`treesize_video`

```sql
CREATE INDEX idx_video_language_pending ON treesize_video(size DESC) WHERE language_detected_at IS NULL;
```

## idx_video_name

> 表：`treesize_video`

```sql
CREATE INDEX idx_video_name            ON treesize_video(name COLLATE NOCASE);
```

## idx_video_person_age_null

> 表：`treesize_video`

```sql
CREATE INDEX idx_video_person_age_null  ON treesize_video(size DESC) WHERE thumbnail_grid_path IS NOT NULL AND person_main_age_group IS NULL;
```

## idx_video_recent_at

> 表：`treesize_video_recent`

```sql
CREATE INDEX idx_video_recent_at ON treesize_video_recent(last_access_at DESC);
```

## idx_video_series_null

> 表：`treesize_video`

```sql
CREATE INDEX idx_video_series_null      ON treesize_video(size DESC) WHERE series_signature IS NULL;
```

## idx_video_series_sig

> 表：`treesize_video`

```sql
CREATE INDEX idx_video_series_sig      ON treesize_video(series_signature);
```

## idx_video_share_created

> 表：`video_share`

```sql
CREATE INDEX idx_video_share_created ON video_share(created_at DESC);
```

## idx_video_share_path

> 表：`video_share`

```sql
CREATE INDEX idx_video_share_path    ON video_share(path);
```

## idx_video_size

> 表：`treesize_video`

```sql
CREATE INDEX idx_video_size            ON treesize_video(size);
```

## idx_webterm_claude_session_cwd_shell

> 表：`webterm_claude_session`

```sql
CREATE UNIQUE INDEX idx_webterm_claude_session_cwd_shell
    ON webterm_claude_session(cwd, shell);
```

## idx_webterm_claude_session_seen

> 表：`webterm_claude_session`

```sql
CREATE INDEX idx_webterm_claude_session_seen
    ON webterm_claude_session(last_seen_at DESC);
```

## idx_wechat_message_chat

> 表：`wechat_message`

```sql
CREATE INDEX idx_wechat_message_chat    ON wechat_message(chat, id);
```

## idx_wechat_message_created

> 表：`wechat_message`

```sql
CREATE INDEX idx_wechat_message_created ON wechat_message(created_at);
```

## idx_wechat_message_msgid

> 表：`wechat_message`

```sql
CREATE INDEX idx_wechat_message_msgid   ON wechat_message(msg_id);
```

## idx_welfare_sign_employee_account

> 表：`welfare_sign_employee`

```sql
CREATE INDEX idx_welfare_sign_employee_account
    ON welfare_sign_employee(account);
```

## idx_welfare_sign_employee_no

> 表：`welfare_sign_employee`

```sql
CREATE UNIQUE INDEX idx_welfare_sign_employee_no
    ON welfare_sign_employee(employee_no);
```

## idx_welfare_sign_employee_phone

> 表：`welfare_sign_employee`

```sql
CREATE INDEX idx_welfare_sign_employee_phone
    ON welfare_sign_employee(phone);
```

## idx_welfare_sign_record_employee

> 表：`welfare_sign_record`

```sql
CREATE UNIQUE INDEX idx_welfare_sign_record_employee
    ON welfare_sign_record(employee_id);
```

## idx_welfare_sign_record_signed

> 表：`welfare_sign_record`

```sql
CREATE INDEX idx_welfare_sign_record_signed
    ON welfare_sign_record(signed_at DESC);
```

## idx_workline_entry_line

> 表：`workline_entry`

```sql
CREATE INDEX idx_workline_entry_line ON workline_entry(line_id);
```

## idx_workline_entry_parent

> 表：`workline_entry`

```sql
CREATE INDEX idx_workline_entry_parent ON workline_entry(parent_id);
```

## uk_consult_prompt_key_ver

> 表：`consult_prompt`

```sql
CREATE UNIQUE INDEX uk_consult_prompt_key_ver ON consult_prompt(prompt_key, version);
```

## uk_doc_source_coord

> 表：`doc_source`

```sql
CREATE UNIQUE INDEX uk_doc_source_coord
    ON doc_source(owner, repo, ref_name, sub_path);
```

## uk_docker_app_host_dir

> 表：`docker_app`

```sql
CREATE UNIQUE INDEX uk_docker_app_host_dir ON docker_app(host_id, base_dir);
```

## uk_eval_case_source_ref

> 表：`eval_case`

```sql
CREATE UNIQUE INDEX uk_eval_case_source_ref ON eval_case(source_ref)
    WHERE source_ref IS NOT NULL AND source_ref <> '';
```

## uk_eval_prompt_key_ver

> 表：`eval_prompt`

```sql
CREATE UNIQUE INDEX uk_eval_prompt_key_ver ON eval_prompt(prompt_key, version);
```

## uk_eval_result_run_case

> 表：`eval_result`

```sql
CREATE UNIQUE INDEX uk_eval_result_run_case ON eval_result(run_id, case_id);
```

## uk_forge_dept_code

> 表：`forge_department`

```sql
CREATE UNIQUE INDEX uk_forge_dept_code ON forge_department(code);
```

## uk_local_doc_source_root

> 表：`local_doc_source`

```sql
CREATE UNIQUE INDEX uk_local_doc_source_root
    ON local_doc_source(root_path);
```

## uniq_va_competitor_name_norm

> 表：`va_competitor`

```sql
CREATE UNIQUE INDEX uniq_va_competitor_name_norm ON va_competitor(name_norm);
```

## uniq_va_cust_add_audit_flowcheckid

> 表：`va_cust_add_audit`

```sql
CREATE UNIQUE INDEX uniq_va_cust_add_audit_flowcheckid ON va_cust_add_audit(flowcheckid);
```

## uniq_va_customer_ref_cust_id

> 表：`va_customer_ref`

```sql
CREATE UNIQUE INDEX uniq_va_customer_ref_cust_id ON va_customer_ref(cust_id);
```

---

## 快照维护

本文件为迁入的历史快照。使用前核对项目迁移脚本及只读实际 Schema；需要刷新时只更新本文件与相邻导引中的来源日期和统计，不再同步集中知识库。
