package com.exceptioncoder.toolbox.claudechat.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/** 队列原文、派发回执及完成准入在同一 SQLite 事务中转换；不根据时间猜测执行完成。 */
@Repository
public class QueueDeliveryStore {
    public record Runtime(String turnId, boolean ready, String stopReason, String taskText, int checkAttempts, boolean checking) { }
    public record Delivery(String messageId, String turnId, String storeId, String status, int attempts, long retryAt, String note) { }
    private final JdbcTemplate jdbc;
    public QueueDeliveryStore(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public Optional<Runtime> runtime(String sessionId) {
        return jdbc.query("SELECT turn_id,release_ready,stop_reason,task_text,check_attempts,checking FROM claude_chat_queue_runtime WHERE session_id=?",
                (rs, n) -> new Runtime(rs.getString(1), rs.getBoolean(2), rs.getString(3), rs.getString(4), rs.getInt(5), rs.getBoolean(6)), sessionId).stream().findFirst();
    }
    public Optional<Delivery> delivery(String sessionId) {
        return jdbc.query("SELECT message_id,turn_id,store_id,status,attempts,retry_at,note FROM claude_chat_queue_delivery WHERE session_id=?",
                (rs, n) -> new Delivery(rs.getString(1),rs.getString(2),rs.getString(3),rs.getString(4),rs.getInt(5),rs.getLong(6),rs.getString(7)), sessionId).stream().findFirst();
    }
    /** 有界轮转，避免扫描所有历史会话；每次巡检最多处理 16 个有队列的会话。 */
    public List<String> sessionsAfter(String after) {
        return jdbc.queryForList("SELECT DISTINCT session_id FROM claude_chat_queued_message WHERE session_id>? ORDER BY session_id LIMIT 16", String.class, after);
    }
    @Transactional
    public void begin(String sessionId, String turnId, String messageId, String storeId) {
        begin(sessionId, turnId, messageId, storeId, null);
    }

    @Transactional
    public void begin(String sessionId, String turnId, String messageId, String storeId, String taskText) {
        if (delivery(sessionId).isPresent()) throw new IllegalStateException("上一条队列派发仍待核对，请勿重复发送");
        if (messageId != null) {
            int inserted = jdbc.update("""
                    INSERT INTO claude_chat_queue_delivery(session_id,message_id,turn_id,store_id,status,retry_at)
                    SELECT session_id,id,?,?,'DISPATCHING',? FROM claude_chat_queued_message WHERE session_id=? AND id=?
                    """, turnId, storeId, System.currentTimeMillis() + 10_000L, sessionId, messageId);
            if (inserted != 1) throw new IllegalStateException("队列项已变化，未发送");
        }
        jdbc.update("""
                INSERT INTO claude_chat_queue_runtime(session_id,turn_id,release_ready,updated_at,task_text) VALUES(?,?,0,?,?)
                ON CONFLICT(session_id) DO UPDATE SET turn_id=excluded.turn_id,release_ready=0,stop_reason=NULL,updated_at=excluded.updated_at,task_text=excluded.task_text,check_attempts=0,checking=0
                """, sessionId, turnId, System.currentTimeMillis(), taskText);
    }
    public boolean accepted(String sessionId, String turnId) {
        return jdbc.update("UPDATE claude_chat_queue_delivery SET status='ACCEPTED',note=NULL WHERE session_id=? AND turn_id=? AND status<>'FAILED'",
                sessionId, turnId) > 0;
    }
    public void uncertain(String sessionId, String turnId, String note) {
        jdbc.update("UPDATE claude_chat_queue_delivery SET status='UNKNOWN',note=? WHERE session_id=? AND turn_id=? AND status<>'FAILED'", note, sessionId, turnId);
    }
    /** 仅同一回执存储明确未收到时，才允许保留原 turnId 的最多三次有界重投。 */
    public boolean retry(String sessionId, Delivery expected) {
        return jdbc.update("""
                UPDATE claude_chat_queue_delivery SET status='DISPATCHING',attempts=attempts+1,retry_at=?,note=NULL
                WHERE session_id=? AND turn_id=? AND attempts=? AND attempts<3
                """, System.currentTimeMillis() + 10_000L * expected.attempts(), sessionId, expected.turnId(), expected.attempts()) == 1;
    }
    /** 在实际发起追问前消耗一次持久次数；崩溃不能把次数清零。 */
    @Transactional
    public boolean beginCheck(String sessionId, Runtime expected, String turnId, String storeId) {
        int changed = jdbc.update("""
                UPDATE claude_chat_queue_runtime SET turn_id=?,release_ready=0,stop_reason=NULL,
                    check_attempts=check_attempts+1,checking=1,updated_at=?
                WHERE session_id=? AND turn_id=? AND check_attempts=? AND check_attempts<3 AND release_ready=0
                """, turnId, System.currentTimeMillis(), sessionId, expected.turnId(), expected.checkAttempts());
        if (changed == 0) return false;
        jdbc.update("""
                UPDATE claude_chat_queue_delivery SET turn_id=?,store_id=?,status='DISPATCHING',attempts=1,retry_at=0,
                    note='正在追问当前任务是否完成；不会把原任务重复入队。' WHERE session_id=?
                """, turnId, storeId, sessionId);
        return true;
    }

    @Transactional
    public boolean markHung(String sessionId, String turnId) {
        int changed = jdbc.update("UPDATE claude_chat_queue_runtime SET stop_reason='queue_check_exhausted' WHERE session_id=? AND turn_id=? AND check_attempts>=3 AND release_ready=0 AND (stop_reason IS NULL OR stop_reason<>'queue_check_exhausted')",
                sessionId, turnId);
        jdbc.update("UPDATE claude_chat_queue_delivery SET status='UNKNOWN',note=? WHERE session_id=? AND turn_id=?",
                "连续三次追问仍异常或无法确认，队列已挂起；核对后点击“已核对，继续队列”。", sessionId, turnId);
        return changed > 0;
    }

    @Transactional
    public void confirmByUser(String sessionId) {
        var runtime = runtime(sessionId).orElseThrow(() -> new IllegalStateException("没有待确认任务"));
        if (runtime.ready()) return;
        settle(sessionId, runtime.turnId(), "user_confirmed", true);
    }

    @Transactional
    public boolean settle(String sessionId, String turnId, String stopReason, boolean safe) {
        if (jdbc.update("UPDATE claude_chat_queue_runtime SET release_ready=?,stop_reason=?,updated_at=? WHERE session_id=? AND turn_id=?",
                safe ? 1 : 0, stopReason, System.currentTimeMillis(), sessionId, turnId) != 1) return false;
        var receipt = delivery(sessionId).filter(d -> d.turnId().equals(turnId));
        if (receipt.isPresent()) {
            boolean successful = List.of("end_turn","success","completed","stop","user_confirmed").contains(stopReason);
            if (successful) {
                jdbc.update("DELETE FROM claude_chat_queued_message WHERE session_id=? AND id=?", sessionId, receipt.get().messageId());
                jdbc.update("DELETE FROM claude_chat_queue_delivery WHERE session_id=? AND turn_id=?", sessionId, turnId);
            } else {
                jdbc.update("UPDATE claude_chat_queue_delivery SET status='FAILED',note=? WHERE session_id=? AND turn_id=?",
                        "当前任务异常或未确认完成，后台将追问；连续三次仍不明确时等待人工确认。", sessionId, turnId);
            }
        }
        return true;
    }
    @Transactional
    public void removePending(String sessionId, String messageId) {
        var current = delivery(sessionId).filter(d -> d.messageId().equals(messageId));
        if (current.isPresent() && !"FAILED".equals(current.get().status())) {
            throw new IllegalStateException("该消息已派发或状态待核对，不能从待发送列表删除；请先核对当前运行状态");
        }
        jdbc.update("DELETE FROM claude_chat_queue_delivery WHERE session_id=? AND message_id=?", sessionId, messageId);
        jdbc.update("DELETE FROM claude_chat_queued_message WHERE session_id=? AND id=?", sessionId, messageId);
    }
}
