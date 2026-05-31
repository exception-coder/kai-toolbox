package com.exceptioncoder.toolbox.frp.repository;

import com.exceptioncoder.toolbox.frp.domain.FrpHostTarget;
import com.exceptioncoder.toolbox.frp.domain.FrpMode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/** frp_host_target 表：按 (host_id, mode) 复合主键存取。 */
@Repository
public class FrpTargetRepository {

    private final JdbcTemplate jdbc;

    public FrpTargetRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<FrpHostTarget> ROW = (rs, i) -> FrpHostTarget.builder()
            .hostId(rs.getString("host_id"))
            .mode(FrpMode.valueOf(rs.getString("mode")))
            .installDir(rs.getString("install_dir"))
            .configJson(rs.getString("config_json"))
            .updatedAt(rs.getLong("updated_at"))
            .build();

    public List<FrpHostTarget> findAll() {
        return jdbc.query("SELECT * FROM frp_host_target ORDER BY updated_at DESC", ROW);
    }

    public List<FrpHostTarget> findByHostId(String hostId) {
        return jdbc.query("SELECT * FROM frp_host_target WHERE host_id = ?", ROW, hostId);
    }

    public Optional<FrpHostTarget> findByHostAndMode(String hostId, FrpMode mode) {
        return jdbc.query("SELECT * FROM frp_host_target WHERE host_id = ? AND mode = ?",
                ROW, hostId, mode.name()).stream().findFirst();
    }

    /** SQLite UPSERT：按 (host_id, mode) 唯一，存在就更新，不存在就插入。 */
    public void upsert(FrpHostTarget t) {
        jdbc.update("""
                INSERT INTO frp_host_target (host_id, mode, install_dir, config_json, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(host_id, mode) DO UPDATE SET
                    install_dir = excluded.install_dir,
                    config_json = excluded.config_json,
                    updated_at  = excluded.updated_at
                """,
                t.getHostId(), t.getMode().name(), t.getInstallDir(),
                t.getConfigJson(), t.getUpdatedAt());
    }

    public void deleteByHostAndMode(String hostId, FrpMode mode) {
        jdbc.update("DELETE FROM frp_host_target WHERE host_id = ? AND mode = ?", hostId, mode.name());
    }
}
