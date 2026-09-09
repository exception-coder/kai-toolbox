-- 功能：Forge 项目库；变更：创建系统注册表；目的：持久化系统身份与初始化状态
CREATE TABLE IF NOT EXISTS forge_project (
    id TEXT PRIMARY KEY,
    local_path TEXT NOT NULL UNIQUE,
    metadata TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'UNINITIALIZED',
    profile_version INTEGER NOT NULL DEFAULT 0,
    create_time INTEGER NOT NULL,
    update_time INTEGER NOT NULL
);
-- 功能：Forge 系统初始化；变更：创建运行记录；目的：保存阶段进度与失败恢复信息
CREATE TABLE IF NOT EXISTS forge_system_init_run (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    state TEXT NOT NULL,
    payload TEXT NOT NULL,
    create_time INTEGER NOT NULL,
    update_time INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_forge_init_active ON forge_system_init_run(project_id) WHERE state = 'RUNNING';
CREATE INDEX IF NOT EXISTS idx_forge_init_project ON forge_system_init_run(project_id, create_time);
-- 功能：Forge 系统画像；变更：创建版本快照；目的：保留可追溯的五类初始化资产
CREATE TABLE IF NOT EXISTS forge_system_profile (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    payload TEXT NOT NULL,
    create_time INTEGER NOT NULL,
    update_time INTEGER NOT NULL,
    UNIQUE(project_id, version)
);
-- 功能：Forge 系统任务；变更：创建需求池任务绑定；目的：将任务关联到稳定系统与画像版本
CREATE TABLE IF NOT EXISTS forge_system_task (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    create_time INTEGER NOT NULL,
    update_time INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_forge_task_project ON forge_system_task(project_id, create_time);
