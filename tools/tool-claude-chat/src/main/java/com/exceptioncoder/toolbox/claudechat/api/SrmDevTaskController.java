package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.domain.SrmConfigChange;
import com.exceptioncoder.toolbox.claudechat.domain.SrmDevTask;
import com.exceptioncoder.toolbox.claudechat.domain.SrmSqlChange;
import com.exceptioncoder.toolbox.claudechat.service.SrmDevTaskService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * SRM 需求开发「开发任务」+ 两类变更登记（SQL / 配置）的 CRUD 接口。纯台账：
 * 只对 SQLite 里的登记做增删改查，绝不连目标库执行 SQL、也不下发配置。
 */
@RestController
@RequestMapping("/api/claude-chat/srm-dev")
public class SrmDevTaskController {

    private final SrmDevTaskService service;

    public SrmDevTaskController(SrmDevTaskService service) {
        this.service = service;
    }

    /** 任务详情：任务本体 + 其下 SQL 登记 + 配置登记，一次性返回，供详情页渲染。 */
    public record TaskDetail(SrmDevTask task, List<SrmSqlChange> sqlChanges, List<SrmConfigChange> configChanges) {
    }

    public record TaskRequest(String title, String moduleName, String requirement, String owner, String status) {
    }

    public record SqlChangeRequest(String title, String dbName, String changeType, String sqlText,
                                   String author, boolean executed, int sortOrder) {
    }

    public record ConfigChangeRequest(String configKey, String scope, String oldValue, String newValue,
                                      String remark, boolean applied, int sortOrder) {
    }

    /* ============ 开发任务 ============ */

    @GetMapping("/tasks")
    public List<SrmDevTask> listTasks() {
        return service.listTasks();
    }

    @GetMapping("/tasks/{id}")
    public TaskDetail getTask(@PathVariable String id) {
        return new TaskDetail(service.getTask(id), service.listSqlChanges(id), service.listConfigChanges(id));
    }

    @PostMapping("/tasks")
    public SrmDevTask createTask(@RequestBody TaskRequest req) {
        return service.createTask(req.title(), req.moduleName(), req.requirement(), req.owner(), req.status());
    }

    @PutMapping("/tasks/{id}")
    public SrmDevTask updateTask(@PathVariable String id, @RequestBody TaskRequest req) {
        return service.updateTask(id, req.title(), req.moduleName(), req.requirement(), req.owner(), req.status());
    }

    @DeleteMapping("/tasks/{id}")
    public void deleteTask(@PathVariable String id) {
        service.deleteTask(id);
    }

    /* ============ SQL 变更登记 ============ */

    @GetMapping("/tasks/{taskId}/sql")
    public List<SrmSqlChange> listSqlChanges(@PathVariable String taskId) {
        return service.listSqlChanges(taskId);
    }

    @PostMapping("/tasks/{taskId}/sql")
    public SrmSqlChange createSqlChange(@PathVariable String taskId, @RequestBody SqlChangeRequest req) {
        return service.createSqlChange(taskId, req.title(), req.dbName(), req.changeType(),
                req.sqlText(), req.author(), req.sortOrder());
    }

    @PutMapping("/tasks/{taskId}/sql/{sqlId}")
    public SrmSqlChange updateSqlChange(@PathVariable String taskId, @PathVariable String sqlId,
                                        @RequestBody SqlChangeRequest req) {
        return service.updateSqlChange(taskId, sqlId, req.title(), req.dbName(), req.changeType(),
                req.sqlText(), req.author(), req.executed(), req.sortOrder());
    }

    @DeleteMapping("/tasks/{taskId}/sql/{sqlId}")
    public void deleteSqlChange(@PathVariable String taskId, @PathVariable String sqlId) {
        service.deleteSqlChange(taskId, sqlId);
    }

    /* ============ 配置变更登记 ============ */

    @GetMapping("/tasks/{taskId}/config")
    public List<SrmConfigChange> listConfigChanges(@PathVariable String taskId) {
        return service.listConfigChanges(taskId);
    }

    @PostMapping("/tasks/{taskId}/config")
    public SrmConfigChange createConfigChange(@PathVariable String taskId, @RequestBody ConfigChangeRequest req) {
        return service.createConfigChange(taskId, req.configKey(), req.scope(), req.oldValue(),
                req.newValue(), req.remark(), req.sortOrder());
    }

    @PutMapping("/tasks/{taskId}/config/{cfgId}")
    public SrmConfigChange updateConfigChange(@PathVariable String taskId, @PathVariable String cfgId,
                                              @RequestBody ConfigChangeRequest req) {
        return service.updateConfigChange(taskId, cfgId, req.configKey(), req.scope(), req.oldValue(),
                req.newValue(), req.remark(), req.applied(), req.sortOrder());
    }

    @DeleteMapping("/tasks/{taskId}/config/{cfgId}")
    public void deleteConfigChange(@PathVariable String taskId, @PathVariable String cfgId) {
        service.deleteConfigChange(taskId, cfgId);
    }
}
