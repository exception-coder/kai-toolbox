package com.exceptioncoder.toolbox.common.launchintent.repository;

import com.exceptioncoder.toolbox.common.launchintent.domain.LaunchIntent;
import com.exceptioncoder.toolbox.common.launchintent.domain.LaunchIntentState;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/** LaunchIntent 生命周期的唯一 SQL 容器。 */
@Repository
public class LaunchIntentRepository {

    private static final RowMapper<LaunchIntent> ROW_MAPPER = (resultSet, rowNumber) -> {
        long acknowledgedValue = resultSet.getLong("acknowledged_at");
        Long acknowledgedAt = resultSet.wasNull() ? null : acknowledgedValue;
        return new LaunchIntent(
                resultSet.getString("id"),
                resultSet.getInt("protocol_version"),
                resultSet.getString("intent_type"),
                resultSet.getString("payload_json"),
                LaunchIntentState.valueOf(resultSet.getString("state")),
                resultSet.getString("last_error"),
                resultSet.getLong("created_at"),
                resultSet.getLong("expires_at"),
                acknowledgedAt,
                resultSet.getLong("updated_at"));
    };

    private final JdbcTemplate jdbc;

    public LaunchIntentRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(LaunchIntent intent) {
        jdbc.update("""
                INSERT INTO platform_launch_intent (
                    id, protocol_version, intent_type, payload_json, state, last_error,
                    created_at, expires_at, acknowledged_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                intent.id(), intent.protocolVersion(), intent.type(), intent.payloadJson(),
                intent.state().name(), intent.lastError(), intent.createdAt(), intent.expiresAt(),
                intent.acknowledgedAt(), intent.updatedAt());
    }

    public Optional<LaunchIntent> findById(String id) {
        return jdbc.query("""
                SELECT id, protocol_version, intent_type, payload_json, state, last_error,
                       created_at, expires_at, acknowledged_at, updated_at
                FROM platform_launch_intent
                WHERE id = ?
                """, ROW_MAPPER, id).stream().findFirst();
    }

    public void updateState(String id, LaunchIntentState state, String lastError,
                            Long acknowledgedAt, long updatedAt) {
        jdbc.update("""
                UPDATE platform_launch_intent
                SET state = ?, last_error = ?, acknowledged_at = ?, updated_at = ?
                WHERE id = ?
                """, state.name(), lastError, acknowledgedAt, updatedAt, id);
    }
}
