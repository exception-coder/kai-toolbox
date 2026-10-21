package com.exceptioncoder.toolbox.foreconsult.suggestion;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.Optional;

/** 审核和执行使用独立持久状态；旧建议不会因升级被自动启动。 */
@Repository
public class ConsultSuggestionWorkRepository {
    private final JdbcTemplate jdbc;
    public ConsultSuggestionWorkRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public void enqueue(String id) {
        jdbc.update("INSERT INTO consult_suggestion_work(suggestion_id,state,updated_at) VALUES (?,'REVIEW_PENDING',?) ON CONFLICT(suggestion_id) DO NOTHING", id, System.currentTimeMillis());
    }

    public Optional<String> claim(String state, String claimed) {
        var ids = jdbc.queryForList("SELECT suggestion_id FROM consult_suggestion_work WHERE state=? ORDER BY updated_at,suggestion_id LIMIT 1", String.class, state);
        if (ids.isEmpty()) return Optional.empty();
        String id = ids.getFirst();
        return jdbc.update("UPDATE consult_suggestion_work SET state=?,attempts=attempts+1,updated_at=? WHERE suggestion_id=? AND state=?",
                claimed, System.currentTimeMillis(), id, state) == 1 ? Optional.of(id) : Optional.empty();
    }

    public void finish(String id, String state, String reason, String requirement, String commit) {
        jdbc.update("UPDATE consult_suggestion_work SET state=?,reason=?,requirement_id=COALESCE(?,requirement_id),commit_hash=COALESCE(?,commit_hash),updated_at=? WHERE suggestion_id=?",
                state, reason, requirement, commit, System.currentTimeMillis(), id);
    }

    public boolean retryReview(String id, long userId) {
        return jdbc.update("UPDATE consult_suggestion_work SET state='REVIEW_PENDING',reason='',updated_at=? WHERE suggestion_id=? AND state='REVIEW_FAILED' AND EXISTS(SELECT 1 FROM consult_suggestion WHERE id=? AND user_id=?)",
                System.currentTimeMillis(), id, id, userId) == 1;
    }

    /** 中断的开发不能盲目重跑并制造第二个分支；保留产物，等待维护人员核对。 */
    public java.util.List<String> interruptedIds() {
        return jdbc.queryForList("SELECT suggestion_id FROM consult_suggestion_work WHERE state='RUNNING'", String.class);
    }

    public void recoverInterrupted() {
        jdbc.update("UPDATE consult_suggestion_work SET state='REVIEW_PENDING' WHERE state='REVIEWING'");
        jdbc.update("UPDATE consult_suggestion_work SET state='FAILED',reason='开发被中断，已保留独立工作区，请维护人员核对后接续' WHERE state='RUNNING'");
    }
}
