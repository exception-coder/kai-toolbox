package com.exceptioncoder.toolbox.knowledgegraph.repository;

import com.exceptioncoder.toolbox.knowledgegraph.model.GraphifyGraphState;
import com.exceptioncoder.toolbox.knowledgegraph.model.ProjectStatusSnapshot;
import com.exceptioncoder.toolbox.knowledgegraph.model.RegistrationState;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 项目状态检测历史的本地库读写（表 {@code kg_status_cache}）。枚举以 name() 存文本，
 * 读时容错（未知枚举/时间解析失败按 null 处理，不让一条脏数据拖垮整表加载）。
 */
@Slf4j
@Repository
public class StatusCacheRepository {

    private final JdbcTemplate jdbc;

    public StatusCacheRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<ProjectStatusSnapshot> ROW = (rs, i) -> new ProjectStatusSnapshot(
            rs.getString("project_path"),
            parseGraphify(rs.getString("graphify_state")),
            parseRegistration(rs.getString("business_graph_state")),
            rs.getString("business_error"),
            parseInstant(rs.getString("checked_at")));

    /** 全部历史，按 project_path -> 快照。 */
    public Map<String, ProjectStatusSnapshot> findAll() {
        Map<String, ProjectStatusSnapshot> map = new LinkedHashMap<>();
        for (ProjectStatusSnapshot s : jdbc.query("SELECT * FROM kg_status_cache", ROW)) {
            if (s != null && s.projectPath() != null) map.put(s.projectPath(), s);
        }
        return map;
    }

    /** 按 project_path upsert 一条检测快照。 */
    public void upsert(ProjectStatusSnapshot s) {
        if (s == null || s.projectPath() == null) return;
        jdbc.update(
                "INSERT INTO kg_status_cache(project_path, graphify_state, business_graph_state, business_error, checked_at) "
                        + "VALUES(?,?,?,?,?) "
                        + "ON CONFLICT(project_path) DO UPDATE SET graphify_state=excluded.graphify_state, "
                        + "business_graph_state=excluded.business_graph_state, business_error=excluded.business_error, "
                        + "checked_at=excluded.checked_at",
                s.projectPath(),
                s.graphifyState() == null ? null : s.graphifyState().name(),
                s.businessGraphState() == null ? null : s.businessGraphState().name(),
                s.businessGraphError(),
                (s.checkedAt() == null ? Instant.now() : s.checkedAt()).toString());
    }

    private static GraphifyGraphState parseGraphify(String v) {
        if (v == null || v.isBlank()) return null;
        try { return GraphifyGraphState.valueOf(v); } catch (IllegalArgumentException e) { return null; }
    }

    private static RegistrationState parseRegistration(String v) {
        if (v == null || v.isBlank()) return null;
        try { return RegistrationState.valueOf(v); } catch (IllegalArgumentException e) { return null; }
    }

    private static Instant parseInstant(String v) {
        if (v == null || v.isBlank()) return Instant.now();
        try { return Instant.parse(v); } catch (RuntimeException e) { return Instant.now(); }
    }
}
