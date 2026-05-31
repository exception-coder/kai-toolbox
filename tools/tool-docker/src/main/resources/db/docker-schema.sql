-- tool-docker：Docker 应用登记表
CREATE TABLE IF NOT EXISTS docker_app (
    id           TEXT PRIMARY KEY,
    host_id      TEXT NOT NULL,
    name         TEXT NOT NULL,
    base_dir     TEXT NOT NULL,
    compose_file TEXT NOT NULL DEFAULT 'docker-compose.yml',
    note         TEXT,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_docker_app_host ON docker_app(host_id);
CREATE UNIQUE INDEX IF NOT EXISTS uk_docker_app_host_dir ON docker_app(host_id, base_dir);
