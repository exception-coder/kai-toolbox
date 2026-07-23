-- Forge 权限体系表。随 SchemaInitializer 启动执行（幂等）；与 toolbox.auth 开关无关，
-- 表始终建好，关闭鉴权时无任何写入。
-- 注意：SchemaInitializer 按分号朴素切分，所有语句必须 IF NOT EXISTS，且注释里不能出现分号。
-- 约定：user_id 逻辑引用 auth_user.id，不建物理外键（跨模块解耦，级联清理由服务层处理）。
-- 时间戳统一 epoch 毫秒（INTEGER），布尔用 0/1，枚举用 TEXT，与 auth_* 表一致。

-- 部门（树形，无限层级）。组织容器/数据权限归属，不参与鉴权链。
CREATE TABLE IF NOT EXISTS forge_department (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id  INTEGER NOT NULL DEFAULT 0,          -- 父部门 id，0=根
    name       TEXT    NOT NULL,
    code       TEXT,                                 -- 部门编码，可空；非空时唯一
    sort       INTEGER NOT NULL DEFAULT 0,           -- 同级排序
    status     TEXT    NOT NULL DEFAULT 'ENABLED',   -- ENABLED/DISABLED
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- SQLite 唯一索引对 NULL 视为互异，多个 NULL code 不冲突，可空唯一天然成立。
CREATE UNIQUE INDEX IF NOT EXISTS uk_forge_dept_code ON forge_department(code);
CREATE INDEX IF NOT EXISTS idx_forge_dept_parent ON forge_department(parent_id);

-- 角色。code 唯一；builtin=1 表示内置（不可删、不可改 code、不可收回权限）。
CREATE TABLE IF NOT EXISTS forge_role (
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

-- 权限码。启动时由代码声明自动同步；后台只读。
CREATE TABLE IF NOT EXISTS forge_permission (
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

CREATE INDEX IF NOT EXISTS idx_forge_perm_module ON forge_permission(module);

-- 角色↔权限码绑定。
CREATE TABLE IF NOT EXISTS forge_role_permission (
    role_id       INTEGER NOT NULL,
    permission_id INTEGER NOT NULL,
    PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_frp_perm ON forge_role_permission(permission_id);

-- 用户↔角色（多角色）。user_id 逻辑引用 auth_user.id。
CREATE TABLE IF NOT EXISTS forge_user_role (
    user_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_fur_role ON forge_user_role(role_id);

-- 用户↔部门归属（本期单部门，故 user_id 作主键）。
CREATE TABLE IF NOT EXISTS forge_user_department (
    user_id       INTEGER PRIMARY KEY,
    department_id INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fud_dept ON forge_user_department(department_id);

-- 权限变更审计（NFR-07）。
CREATE TABLE IF NOT EXISTS forge_audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    operator_id INTEGER NOT NULL,                    -- 操作人 user_id
    action      TEXT    NOT NULL,                    -- ROLE_UPDATE/ROLE_PERM_BIND/USER_ROLE_ASSIGN 等
    target_type TEXT    NOT NULL,
    target_id   TEXT,
    detail      TEXT,                                -- 变更前后快照（JSON）
    created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_forge_audit_operator ON forge_audit_log(operator_id);
CREATE INDEX IF NOT EXISTS idx_forge_audit_action ON forge_audit_log(action);
