package com.exceptioncoder.toolbox.assistant.repository;

import com.exceptioncoder.toolbox.assistant.domain.AssistantConversationAnalysis;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/** Assistant 会话反馈分析水位与滚动摘要持久化。 */
@Repository
public class AssistantConversationAnalysisRepository {

    private final JdbcTemplate jdbc;

    public AssistantConversationAnalysisRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 按当前用户和会话读取唯一分析状态。 */
    public Optional<AssistantConversationAnalysis> find(long creatorUserId, String sessionId) {
        return jdbc.query("""
                SELECT id, creator_user_id, session_id, analysis_watermark, summary_text,
                       create_time, update_time
                  FROM assistant_conversation_analysis
                 WHERE creator_user_id = ? AND session_id = ?
                 LIMIT 1
                """, (resultSet, rowNum) -> new AssistantConversationAnalysis(
                resultSet.getString("id"), resultSet.getLong("creator_user_id"),
                resultSet.getString("session_id"), resultSet.getLong("analysis_watermark"),
                resultSet.getString("summary_text"), resultSet.getLong("create_time"),
                resultSet.getLong("update_time")), creatorUserId, sessionId).stream().findFirst();
    }

    /** 原子新增或推进同一用户会话的分析状态。 */
    public void upsert(AssistantConversationAnalysis state) {
        jdbc.update("""
                INSERT INTO assistant_conversation_analysis
                  (id, creator_user_id, session_id, analysis_watermark, summary_text,
                   create_time, update_time)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(creator_user_id, session_id) DO UPDATE SET
                  analysis_watermark = excluded.analysis_watermark,
                  summary_text = excluded.summary_text,
                  update_time = excluded.update_time
                """, state.id(), state.creatorUserId(), state.sessionId(), state.watermark(),
                state.summary(), state.createTime(), state.updateTime());
    }
}
