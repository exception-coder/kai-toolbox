package com.exceptioncoder.toolbox.assistant.repository;

import com.exceptioncoder.toolbox.assistant.domain.AssistantDraft;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/** Assistant 草稿持久化。 */
@Repository
public class AssistantDraftRepository {

    private final JdbcTemplate jdbc;

    public AssistantDraftRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 保存新草稿。 */
    public void insert(AssistantDraft draft) {
        jdbc.update("""
                INSERT INTO assistant_draft
                  (id, creator_user_id, session_id, kind, title, description, context_snapshot_json,
                   evidence_json, status, create_time, update_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, draft.id(), draft.creatorUserId(), draft.sessionId(), draft.kind(), draft.title(),
                draft.description(), draft.contextSnapshotJson(), draft.evidenceJson(), draft.status(),
                draft.createTime(), draft.updateTime());
    }

    /** 按标识读取草稿。 */
    public Optional<AssistantDraft> findById(String id) {
        return jdbc.query("""
                SELECT id, creator_user_id, session_id, kind, title, description, context_snapshot_json,
                       evidence_json, status, create_time, update_time
                  FROM assistant_draft
                 WHERE id = ?
                """, (resultSet, rowNum) -> new AssistantDraft(
                resultSet.getString("id"), resultSet.getLong("creator_user_id"),
                resultSet.getString("session_id"), resultSet.getString("kind"), resultSet.getString("title"),
                resultSet.getString("description"), resultSet.getString("context_snapshot_json"),
                resultSet.getString("evidence_json"), resultSet.getString("status"),
                resultSet.getLong("create_time"), resultSet.getLong("update_time")), id).stream().findFirst();
    }

    /** 将草稿标记为已确认。 */
    public void markConfirmed(String id, long updateTime) {
        jdbc.update("UPDATE assistant_draft SET status = 'CONFIRMED', update_time = ? WHERE id = ?",
                updateTime, id);
    }
}
