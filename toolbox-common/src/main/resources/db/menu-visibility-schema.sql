-- 菜单显隐（按登录用户）持久化表
-- 一个用户一行；visible_ids_json 存该用户「可见模块 id 白名单」的 JSON 字符串数组。
-- user_id 逻辑引用 auth_user.id，不建物理外键（与 forge_user_* 一致）。
CREATE TABLE IF NOT EXISTS menu_visibility (
    user_id          INTEGER PRIMARY KEY,
    visible_ids_json TEXT    NOT NULL,
    updated_at       INTEGER NOT NULL
);
