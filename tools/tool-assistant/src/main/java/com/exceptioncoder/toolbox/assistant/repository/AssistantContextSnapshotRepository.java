package com.exceptioncoder.toolbox.assistant.repository;

import com.exceptioncoder.toolbox.assistant.domain.AssistantContextSnapshot;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/** Assistant 上下文快照持久化。 */
@Repository
public class AssistantContextSnapshotRepository {

    private final JdbcTemplate jdbc;

    public AssistantContextSnapshotRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 保存不可变快照。 */
    public void insert(AssistantContextSnapshot snapshot) {
        jdbc.update("""
                INSERT INTO assistant_context_snapshot
                  (id, session_id, creator_user_id, protocol_version, snapshot_json, create_time, update_time)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, snapshot.id(), snapshot.sessionId(), snapshot.creatorUserId(), snapshot.protocolVersion(),
                snapshot.snapshotJson(), snapshot.createTime(), snapshot.createTime());
    }

    /** 读取会话最新快照。 */
    public Optional<AssistantContextSnapshot> findLatest(String sessionId) {
        return jdbc.query("""
                SELECT id, session_id, creator_user_id, protocol_version, snapshot_json, create_time
                  FROM assistant_context_snapshot
                 WHERE session_id = ?
                 ORDER BY create_time DESC
                 LIMIT 1
                """, (resultSet, rowNum) -> new AssistantContextSnapshot(
                resultSet.getString("id"), resultSet.getString("session_id"),
                resultSet.getLong("creator_user_id"), resultSet.getString("protocol_version"),
                resultSet.getString("snapshot_json"), resultSet.getLong("create_time")), sessionId)
                .stream().findFirst();
    }
}
