-- JWT 鉴权能力库表。仅在 toolbox.auth.enabled=true 时被业务读写，但 DDL 始终随
-- SchemaInitializer 启动执行（幂等），关闭时表存在也无任何写入。
-- 注意：SchemaInitializer 按分号做朴素切分，所有语句必须 IF NOT EXISTS，
-- 且注释里不能出现分号（否则会被切成非法片段）。

CREATE TABLE IF NOT EXISTS auth_user (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,           -- BCrypt 哈希，永不存明文
    real_name     TEXT,                       -- 真实姓名，可空
    roles         TEXT    NOT NULL DEFAULT 'USER',  -- 逗号分隔，如 'ADMIN,USER'
    enabled       INTEGER NOT NULL DEFAULT 1,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_user_username ON auth_user(username);

-- refresh token 一次性 + 轮换：登录/刷新写入，刷新时把旧记录 revoked 置 1。
-- 只存 token 哈希，不存明文。
CREATE TABLE IF NOT EXISTS auth_refresh_token (
    jti        TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    token_hash TEXT    NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked    INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_user ON auth_refresh_token(user_id);

-- access token 黑名单：登出/吊销时写入被拉黑的 jti，过滤器校验时查。
-- 只保留到 token 自身 exp，惰性清理避免无限增长。
CREATE TABLE IF NOT EXISTS auth_token_blacklist (
    jti        TEXT    PRIMARY KEY,
    expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_blacklist_exp ON auth_token_blacklist(expires_at);
