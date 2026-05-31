-- 每个 (主机, 角色) 是一条独立记录。
-- 这样 Host A 的 frps 配置和 Host B 的 frpc 配置完全互不干扰；
-- 同一台机器也可以同时配 frps 和 frpc（少见但合法），各自独立保存 installDir + config。
-- (旧表 frp_target 如有遗留，直接不再使用，留着不影响。)
CREATE TABLE IF NOT EXISTS frp_host_target (
    host_id      TEXT NOT NULL,
    mode         TEXT NOT NULL,
    install_dir  TEXT NOT NULL,
    config_json  TEXT,
    updated_at   INTEGER NOT NULL,
    PRIMARY KEY (host_id, mode)
);
