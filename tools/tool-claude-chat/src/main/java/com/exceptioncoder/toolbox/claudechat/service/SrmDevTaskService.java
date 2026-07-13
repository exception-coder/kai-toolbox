package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.SrmConfigChange;
import com.exceptioncoder.toolbox.claudechat.domain.SrmDevTask;
import com.exceptioncoder.toolbox.claudechat.domain.SrmSqlChange;
import com.exceptioncoder.toolbox.claudechat.repository.SrmDevTaskRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

/**
 * SRM 开发任务 + 变更登记（SQL / 配置）的业务层：生成 id/时间戳、校验必填、维护 updated_at。
 * 纯台账，任何写入都不触发对目标库/配置中心的真实执行。
 */
@Service
public class SrmDevTaskService {

    private final SrmDevTaskRepository repo;

    public SrmDevTaskService(SrmDevTaskRepository repo) {
        this.repo = repo;
    }

    private static String newId() {
        return UUID.randomUUID().toString();
    }

    private static String trimOrNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    /* ============ 开发任务 ============ */

    public List<SrmDevTask> listTasks() {
        return repo.listTasks();
    }

    public SrmDevTask getTask(String id) {
        SrmDevTask t = repo.findTask(id);
        if (t == null) {
            throw new IllegalArgumentException("开发任务不存在：" + id);
        }
        return t;
    }

    public SrmDevTask createTask(String title, String moduleName, String requirement, String owner, String status) {
        if (title == null || title.isBlank()) {
            throw new IllegalArgumentException("任务标题不能为空");
        }
        long now = System.currentTimeMillis();
        SrmDevTask t = new SrmDevTask(newId(), title.trim(), trimOrNull(moduleName),
                trimOrNull(requirement), trimOrNull(owner),
                normalizeStatus(status), now, now);
        repo.insertTask(t);
        return t;
    }

    public SrmDevTask updateTask(String id, String title, String moduleName, String requirement, String owner, String status) {
        SrmDevTask old = getTask(id);
        if (title == null || title.isBlank()) {
            throw new IllegalArgumentException("任务标题不能为空");
        }
        SrmDevTask t = new SrmDevTask(id, title.trim(), trimOrNull(moduleName),
                trimOrNull(requirement), trimOrNull(owner), normalizeStatus(status),
                old.createdAt(), System.currentTimeMillis());
        repo.updateTask(t);
        return t;
    }

    public void deleteTask(String id) {
        getTask(id);
        repo.deleteTask(id);
    }

    private static String normalizeStatus(String status) {
        if (status == null || status.isBlank()) {
            return "open";
        }
        return switch (status.trim()) {
            case "open", "developing", "done", "archived" -> status.trim();
            default -> "open";
        };
    }

    /** 任一子登记变更后，顺手推进父任务 updated_at，让列表按最近活跃排序。 */
    private void touchTask(String taskId) {
        SrmDevTask t = repo.findTask(taskId);
        if (t != null) {
            repo.updateTask(new SrmDevTask(t.id(), t.title(), t.moduleName(), t.requirement(),
                    t.owner(), t.status(), t.createdAt(), System.currentTimeMillis()));
        }
    }

    /* ============ SQL 变更登记 ============ */

    public List<SrmSqlChange> listSqlChanges(String taskId) {
        getTask(taskId);
        return repo.listSqlChanges(taskId);
    }

    public SrmSqlChange createSqlChange(String taskId, String title, String dbName, String changeType,
                                        String sqlText, String author, int sortOrder) {
        getTask(taskId);
        if (sqlText == null || sqlText.isBlank()) {
            throw new IllegalArgumentException("SQL 内容不能为空");
        }
        long now = System.currentTimeMillis();
        SrmSqlChange c = new SrmSqlChange(newId(), taskId, trimOrNull(title), trimOrNull(dbName),
                trimOrNull(changeType), sqlText.trim(), trimOrNull(author), false, sortOrder, now, now);
        repo.insertSqlChange(c);
        touchTask(taskId);
        return c;
    }

    public SrmSqlChange updateSqlChange(String taskId, String id, String title, String dbName, String changeType,
                                        String sqlText, String author, boolean executed, int sortOrder) {
        List<SrmSqlChange> existing = repo.listSqlChanges(taskId);
        SrmSqlChange old = existing.stream().filter(x -> x.id().equals(id)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("SQL 登记不存在：" + id));
        if (sqlText == null || sqlText.isBlank()) {
            throw new IllegalArgumentException("SQL 内容不能为空");
        }
        SrmSqlChange c = new SrmSqlChange(id, taskId, trimOrNull(title), trimOrNull(dbName),
                trimOrNull(changeType), sqlText.trim(), trimOrNull(author), executed, sortOrder,
                old.createdAt(), System.currentTimeMillis());
        repo.updateSqlChange(c);
        touchTask(taskId);
        return c;
    }

    public void deleteSqlChange(String taskId, String id) {
        getTask(taskId);
        repo.deleteSqlChange(id);
        touchTask(taskId);
    }

    /* ============ 配置变更登记 ============ */

    public List<SrmConfigChange> listConfigChanges(String taskId) {
        getTask(taskId);
        return repo.listConfigChanges(taskId);
    }

    public SrmConfigChange createConfigChange(String taskId, String configKey, String scope, String oldValue,
                                              String newValue, String remark, int sortOrder) {
        getTask(taskId);
        if (configKey == null || configKey.isBlank()) {
            throw new IllegalArgumentException("配置项 key 不能为空");
        }
        long now = System.currentTimeMillis();
        SrmConfigChange c = new SrmConfigChange(newId(), taskId, configKey.trim(), trimOrNull(scope),
                oldValue, newValue, trimOrNull(remark), false, sortOrder, now, now);
        repo.insertConfigChange(c);
        touchTask(taskId);
        return c;
    }

    public SrmConfigChange updateConfigChange(String taskId, String id, String configKey, String scope,
                                              String oldValue, String newValue, String remark,
                                              boolean applied, int sortOrder) {
        List<SrmConfigChange> existing = repo.listConfigChanges(taskId);
        SrmConfigChange old = existing.stream().filter(x -> x.id().equals(id)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("配置登记不存在：" + id));
        if (configKey == null || configKey.isBlank()) {
            throw new IllegalArgumentException("配置项 key 不能为空");
        }
        SrmConfigChange c = new SrmConfigChange(id, taskId, configKey.trim(), trimOrNull(scope),
                oldValue, newValue, trimOrNull(remark), applied, sortOrder,
                old.createdAt(), System.currentTimeMillis());
        repo.updateConfigChange(c);
        touchTask(taskId);
        return c;
    }

    public void deleteConfigChange(String taskId, String id) {
        getTask(taskId);
        repo.deleteConfigChange(id);
        touchTask(taskId);
    }
}
