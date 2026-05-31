package com.exceptioncoder.toolbox.common.featureconfig.repository;

import com.exceptioncoder.toolbox.common.featureconfig.domain.FeatureConfig;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public class FeatureConfigRepository {

    private final JdbcTemplate jdbc;

    public FeatureConfigRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<FeatureConfig> ROW = (rs, i) -> FeatureConfig.builder()
            .featureId(rs.getString("feature_id"))
            .valueJson(rs.getString("value_json"))
            .updatedAt(rs.getLong("updated_at"))
            .build();

    public Optional<FeatureConfig> findById(String featureId) {
        return jdbc.query(
                "SELECT * FROM feature_config WHERE feature_id = ?",
                ROW, featureId
        ).stream().findFirst();
    }

    /**
     * SQLite 3.24+ 的 UPSERT 语法，单语句完成 INSERT/UPDATE，无需显式事务。
     */
    public void upsert(FeatureConfig cfg) {
        jdbc.update("""
                INSERT INTO feature_config (feature_id, value_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(feature_id) DO UPDATE SET
                    value_json = excluded.value_json,
                    updated_at = excluded.updated_at
                """,
                cfg.getFeatureId(), cfg.getValueJson(), cfg.getUpdatedAt());
    }

    public void deleteById(String featureId) {
        jdbc.update("DELETE FROM feature_config WHERE feature_id = ?", featureId);
    }
}
