package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.SrmConfigChange;
import com.exceptioncoder.toolbox.claudechat.domain.SrmDevTask;
import com.exceptioncoder.toolbox.claudechat.domain.SrmSqlChange;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * SRM 开发任务 + 两类变更登记（SQL / 配置）的持久化。三张表同属「SRM 需求开发」一个功能，故合在一个 repo。
 * 全部为普通增删改查，无任何执行副作用（变更登记是纯台账）。
 */
@Repository
public class SrmDevTaskRepository {

    private final JdbcTemplate jdbc;

    public SrmDevTaskRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<SrmDevTask> TASK = (rs, i) -> new SrmDevTask(
            rs.getString("id"), rs.getString("title"), rs.getString("module_name"),
            rs.getString("requirement"), rs.getString("owner"), rs.getString("status"),
            rs.getLong("created_at"), rs.getLong("updated_at"));

    private static final RowMapper<SrmSqlChange> SQL_CHANGE = (rs, i) -> new SrmSqlChange(
            rs.getString("id"), rs.getString("task_id"), rs.getString("title"),
            rs.getString("db_name"), rs.getString("change_type"), rs.getString("sql_text"),
            rs.getString("author"), rs.getInt("executed") != 0, rs.getInt("sort_order"),
            rs.getLong("created_at"), rs.getLong("updated_at"));

    private static final RowMapper<SrmConfigChange> CONFIG_CHANGE = (rs, i) -> new SrmConfigChange(
            rs.getString("id"), rs.getString("task_id"), rs.getString("config_key"),
            rs.getString("scope"), rs.getString("old_value"), rs.getString("new_value"),
            rs.getString("remark"), rs.getInt("applied") != 0, rs.getInt("sort_order"),
            rs.getLong("created_at"), rs.getLong("updated_at"));

    /* ============ 开发任务 ============ */

    public List<SrmDevTask> listTasks() {
        return jdbc.query("SELECT * FROM srm_dev_task ORDER BY updated_at DESC", TASK);
    }

    public SrmDevTask findTask(String id) {
        List<SrmDevTask> rows = jdbc.query("SELECT * FROM srm_dev_task WHERE id = ?", TASK, id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public void insertTask(SrmDevTask t) {
        jdbc.update("""
                INSERT INTO srm_dev_task (id, title, module_name, requirement, owner, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, t.id(), t.title(), t.moduleName(), t.requirement(), t.owner(), t.status(),
                t.createdAt(), t.updatedAt());
    }

    public void updateTask(SrmDevTask t) {
        jdbc.update("""
                UPDATE srm_dev_task
                   SET title = ?, module_name = ?, requirement = ?, owner = ?, status = ?, updated_at = ?
                 WHERE id = ?
                """, t.title(), t.moduleName(), t.requirement(), t.owner(), t.status(),
                t.updatedAt(), t.id());
    }

    /** 删除任务并级联其下 SQL/配置登记（SQLite 无外键级联，手动删）。 */
    public void deleteTask(String id) {
        jdbc.update("DELETE FROM srm_dev_sql_change WHERE task_id = ?", id);
        jdbc.update("DELETE FROM srm_dev_config_change WHERE task_id = ?", id);
        jdbc.update("DELETE FROM srm_dev_task WHERE id = ?", id);
    }

    /* ============ SQL 变更登记 ============ */

    public List<SrmSqlChange> listSqlChanges(String taskId) {
        return jdbc.query(
                "SELECT * FROM srm_dev_sql_change WHERE task_id = ? ORDER BY sort_order, created_at",
                SQL_CHANGE, taskId);
    }

    public void insertSqlChange(SrmSqlChange c) {
        jdbc.update("""
                INSERT INTO srm_dev_sql_change
                    (id, task_id, title, db_name, change_type, sql_text, author, executed, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, c.id(), c.taskId(), c.title(), c.dbName(), c.changeType(), c.sqlText(),
                c.author(), c.executed() ? 1 : 0, c.sortOrder(), c.createdAt(), c.updatedAt());
    }

    public void updateSqlChange(SrmSqlChange c) {
        jdbc.update("""
                UPDATE srm_dev_sql_change
                   SET title = ?, db_name = ?, change_type = ?, sql_text = ?, author = ?,
                       executed = ?, sort_order = ?, updated_at = ?
                 WHERE id = ?
                """, c.title(), c.dbName(), c.changeType(), c.sqlText(), c.author(),
                c.executed() ? 1 : 0, c.sortOrder(), c.updatedAt(), c.id());
    }

    public void deleteSqlChange(String id) {
        jdbc.update("DELETE FROM srm_dev_sql_change WHERE id = ?", id);
    }

    /* ============ 配置变更登记 ============ */

    public List<SrmConfigChange> listConfigChanges(String taskId) {
        return jdbc.query(
                "SELECT * FROM srm_dev_config_change WHERE task_id = ? ORDER BY sort_order, created_at",
                CONFIG_CHANGE, taskId);
    }

    public void insertConfigChange(SrmConfigChange c) {
        jdbc.update("""
                INSERT INTO srm_dev_config_change
                    (id, task_id, config_key, scope, old_value, new_value, remark, applied, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, c.id(), c.taskId(), c.configKey(), c.scope(), c.oldValue(), c.newValue(),
                c.remark(), c.applied() ? 1 : 0, c.sortOrder(), c.createdAt(), c.updatedAt());
    }

    public void updateConfigChange(SrmConfigChange c) {
        jdbc.update("""
                UPDATE srm_dev_config_change
                   SET config_key = ?, scope = ?, old_value = ?, new_value = ?, remark = ?,
                       applied = ?, sort_order = ?, updated_at = ?
                 WHERE id = ?
                """, c.configKey(), c.scope(), c.oldValue(), c.newValue(), c.remark(),
                c.applied() ? 1 : 0, c.sortOrder(), c.updatedAt(), c.id());
    }

    public void deleteConfigChange(String id) {
        jdbc.update("DELETE FROM srm_dev_config_change WHERE id = ?", id);
    }
}
