package com.exceptioncoder.toolbox.common.forge.repository;

import com.exceptioncoder.toolbox.common.forge.model.AuditLog;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * forge_audit_log 写入与近期查询。
 */
@Repository
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class AuditLogRepository {

    private final JdbcTemplate jdbc;

    public AuditLogRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<AuditLog> ROW = (rs, i) -> AuditLog.builder()
            .id(rs.getLong("id"))
            .operatorId(rs.getLong("operator_id"))
            .action(rs.getString("action"))
            .targetType(rs.getString("target_type"))
            .targetId(rs.getString("target_id"))
            .detail(rs.getString("detail"))
            .createdAt(rs.getLong("created_at"))
            .build();

    public void insert(AuditLog e) {
        jdbc.update("INSERT INTO forge_audit_log (operator_id, action, target_type, target_id, detail, "
                        + "created_at) VALUES (?, ?, ?, ?, ?, ?)",
                e.getOperatorId(), e.getAction(), e.getTargetType(), e.getTargetId(),
                e.getDetail(), e.getCreatedAt());
    }

    public List<AuditLog> findRecent(int limit) {
        return jdbc.query("SELECT * FROM forge_audit_log ORDER BY id DESC LIMIT ?", ROW, limit);
    }
}
