package com.exceptioncoder.toolbox.projects.registry.infrastructure;

import com.exceptioncoder.toolbox.projects.registry.domain.*;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/** SQLite 项目聚合存储；使用唯一索引与事务防止重复领取和半发布。 */
@Repository
public class JdbcProjectRegistryStore implements ProjectRegistryStore {
    private static final String PROJECT_COLUMNS =
            "id, metadata, state, profile_version, create_time, update_time";
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public JdbcProjectRegistryStore(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    public List<RegistryProject> projects() {
        return jdbc.query("SELECT " + PROJECT_COLUMNS + " FROM forge_project ORDER BY create_time DESC LIMIT 500",
                projectMapper());
    }

    @Override
    public Optional<RegistryProject> project(String id) {
        return jdbc.query("SELECT " + PROJECT_COLUMNS + " FROM forge_project WHERE id = ?", projectMapper(), id)
                .stream().findFirst();
    }

    @Override
    public void insert(RegistryProject project) {
        int changed = jdbc.update("""
                INSERT INTO forge_project(id, local_path, metadata, state, profile_version, create_time, update_time)
                VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(local_path) DO NOTHING
                """, project.id(), project.metadata().localPath(), encode(project.metadata()), project.state(),
                project.profileVersion(), project.createdAt(), project.updatedAt());
        if (changed != 1) {
            throw new org.springframework.dao.DuplicateKeyException("项目目录已登记");
        }
    }

    @Override
    public void update(RegistryProject project) {
        Integer duplicates = jdbc.queryForObject("SELECT COUNT(id) FROM forge_project WHERE local_path = ? AND id <> ?",
                Integer.class, project.metadata().localPath(), project.id());
        if (duplicates != null && duplicates > 0) {
            throw new org.springframework.dao.DuplicateKeyException("项目目录已登记");
        }
        int changed = jdbc.update("""
                UPDATE forge_project SET local_path = ?, metadata = ?, state = ?, update_time = ?
                WHERE id = ? AND state <> 'INITIALIZING'
                """, project.metadata().localPath(), encode(project.metadata()), project.state(),
                project.updatedAt(), project.id());
        if (changed != 1) {
            throw new IllegalStateException("初始化期间无法修改项目，请等待完成后重试");
        }
    }

    @Override
    public void markSyncRequired(String projectId, int version) {
        jdbc.update("""
                UPDATE forge_project SET state = 'SYNC_REQUIRED'
                WHERE id = ? AND profile_version = ? AND state IN ('AI_READY', 'DEGRADED')
                """, projectId, version);
    }

    @Override
    public Optional<SystemProfile> profile(String projectId, int version) {
        return jdbc.query("SELECT payload FROM forge_system_profile WHERE project_id = ? AND version = ?",
                (rs, row) -> decode(rs.getString("payload"), SystemProfile.class), projectId, version)
                .stream().findFirst();
    }

    @Override
    public List<SystemInitRun> runs(String projectId) {
        return jdbc.query("""
                SELECT payload FROM forge_system_init_run
                WHERE project_id = ? ORDER BY create_time DESC LIMIT 20
                """, (rs, row) -> decode(rs.getString("payload"), SystemInitRun.class), projectId);
    }

    @Override
    @Transactional
    public void claim(SystemInitRun run) {
        int changed = jdbc.update("""
                UPDATE forge_project SET state = 'INITIALIZING', update_time = ?
                WHERE id = ? AND state <> 'INITIALIZING'
                """, run.updatedAt(), run.projectId());
        if (changed != 1) {
            throw new IllegalStateException("项目已有初始化任务正在运行");
        }
        jdbc.update("""
                INSERT INTO forge_system_init_run(id, project_id, state, payload, create_time, update_time)
                VALUES (?, ?, ?, ?, ?, ?)
                """, run.id(), run.projectId(), run.state(), encode(run), run.startedAt(), run.updatedAt());
    }

    @Override
    public void saveRun(SystemInitRun run) {
        jdbc.update("UPDATE forge_system_init_run SET state = ?, payload = ?, update_time = ? WHERE id = ?",
                run.state(), encode(run), run.updatedAt(), run.id());
    }

    @Override
    @Transactional
    public void publish(SystemInitRun run, SystemProfile profile) {
        jdbc.update("""
                INSERT INTO forge_system_profile(id, project_id, version, payload, create_time, update_time)
                VALUES (?, ?, ?, ?, ?, ?)
                """, run.id(), profile.projectId(), profile.version(), encode(profile),
                profile.generatedAt(), profile.generatedAt());
        jdbc.update("UPDATE forge_project SET state = ?, profile_version = ?, update_time = ? WHERE id = ?",
                profile.state(), profile.version(), profile.generatedAt(), profile.projectId());
        saveRun(run);
    }

    @Override
    @Transactional
    public void fail(SystemInitRun run) {
        saveRun(run);
        jdbc.update("UPDATE forge_project SET state = 'FAILED', update_time = ? WHERE id = ?",
                run.updatedAt(), run.projectId());
    }

    @Override
    @Transactional
    public void recoverInterrupted() {
        List<SystemInitRun> interrupted = jdbc.query(
                "SELECT payload FROM forge_system_init_run WHERE state = 'RUNNING'",
                (rs, row) -> decode(rs.getString("payload"), SystemInitRun.class));
        for (SystemInitRun run : interrupted) {
            var stages = run.stages().stream().map(stage -> "RUNNING".equals(stage.state())
                    ? new SystemInitRun.Stage(stage.id(), stage.title(), "FAILED", "服务重启导致运行中断") : stage).toList();
            fail(new SystemInitRun(run.id(), run.projectId(), run.mode(), "FAILED", stages,
                    "服务重启导致运行中断，请重新初始化；上次画像已保留", run.startedAt(), System.currentTimeMillis()));
        }
    }

    @Override
    public void bindTask(SystemTaskBinding task) {
        jdbc.update("""
                INSERT INTO forge_system_task(id, project_id, payload, create_time, update_time)
                VALUES (?, ?, ?, ?, ?)
                """, task.id(), task.projectId(), encode(task), task.createdAt(), task.createdAt());
    }

    @Override
    public List<SystemTaskBinding> tasks(String projectId) {
        return jdbc.query("""
                SELECT payload FROM forge_system_task WHERE project_id = ? ORDER BY create_time DESC LIMIT 100
                """, (rs, row) -> decode(rs.getString("payload"), SystemTaskBinding.class), projectId);
    }

    @Override
    public Optional<SystemTaskBinding> task(String projectId, String taskId) {
        return jdbc.query("SELECT payload FROM forge_system_task WHERE project_id = ? AND id = ?",
                (rs, row) -> decode(rs.getString("payload"), SystemTaskBinding.class), projectId, taskId)
                .stream().findFirst();
    }

    private RowMapper<RegistryProject> projectMapper() {
        return (rs, row) -> new RegistryProject(rs.getString("id"),
                decode(rs.getString("metadata"), RegistryProject.Metadata.class), rs.getString("state"),
                rs.getInt("profile_version"), rs.getLong("create_time"), rs.getLong("update_time"));
    }

    private String encode(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("系统画像序列化失败", exception);
        }
    }

    private <T> T decode(String value, Class<T> type) {
        try {
            return json.readValue(value, type);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("系统画像数据损坏，请检查数据库备份", exception);
        }
    }
}
