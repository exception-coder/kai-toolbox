package com.exceptioncoder.toolbox.claudechat.workassistants;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.UUID;

/** 工作助理会话与任务的 SQLite 存储，所有会话读取带所有者条件。 */
@Repository
public class AssistantSessions {
    private final JdbcTemplate jdbc;

    public AssistantSessions(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Session create(long owner, AssistantCatalog.Definition assistant, String title,
                          String engine, String model, String evidence, String requestId, String creationHash) {
        String id = UUID.randomUUID().toString();
        jdbc.update("""
                INSERT INTO chat_work_assistant_session
                (id,user_id,assistant_id,title,skill_text,skill_hash,engine,model,evidence,created_at,request_id,creation_hash)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                """, id, owner, assistant.id(), title, assistant.text(), assistant.hash(),
                engine, model, evidence, System.currentTimeMillis(), requestId, creationHash);
        return required(owner, id);
    }

    public java.util.Optional<Session> findCreation(long owner, String requestId) {
        return jdbc.query("SELECT * FROM chat_work_assistant_session WHERE user_id=? AND request_id=?",
                (row, index) -> session(row), owner, requestId).stream().findFirst();
    }

    public List<Session> list(long owner) {
        return jdbc.query("SELECT * FROM chat_work_assistant_session WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
                (row, index) -> session(row), owner);
    }

    public Session required(long owner, String id) {
        return jdbc.query("SELECT * FROM chat_work_assistant_session WHERE id=? AND user_id=?",
                (row, index) -> session(row), id, owner).stream().findFirst()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.NOT_FOUND, "助理会话不存在或无权访问"));
    }

    public List<Turn> turns(String sessionId) {
        return jdbc.query("""
                SELECT id,request_id,input,output,status,error,created_at FROM
                (SELECT * FROM chat_work_assistant_turn WHERE session_id=? ORDER BY created_at DESC,rowid DESC LIMIT 20)
                ORDER BY created_at ASC
                """, (row, index) -> new Turn(row.getString("id"), row.getString("request_id"),
                row.getString("input"), row.getString("output"), row.getString("status"),
                row.getString("error"), row.getLong("created_at")), sessionId);
    }

    public Turn start(String sessionId, String requestId, String input) {
        var existing = turns(sessionId).stream().filter(value -> value.requestId().equals(requestId)).findFirst();
        if (existing.isPresent()) {
            if (!existing.get().input().equals(input)) {
                throw new IllegalArgumentException("请求标识已使用，请核对任务结果");
            }
            return existing.get();
        }
        if (jdbc.queryForObject("SELECT count(*) FROM chat_work_assistant_turn WHERE session_id=?", Integer.class, sessionId) >= 20) {
            throw new IllegalArgumentException("当前任务已达 20 轮，请创建新任务继续");
        }
        String id = UUID.randomUUID().toString();
        jdbc.update("""
                INSERT INTO chat_work_assistant_turn(id,session_id,request_id,input,status,created_at)
                VALUES (?,?,?,?,'RUNNING',?)
                """, id, sessionId, requestId, input, System.currentTimeMillis());
        return turns(sessionId).stream().filter(value -> value.id().equals(id)).findFirst().orElseThrow();
    }

    public void finish(String id, String status, String output, String error) {
        jdbc.update("UPDATE chat_work_assistant_turn SET status=?,output=?,error=? WHERE id=? AND status='RUNNING'",
                status, output, error, id);
    }

    public void recover() {
        jdbc.update("""
                UPDATE chat_work_assistant_turn SET status='FAILED',error='服务已重启，本次任务中断；请核对后重试'
                WHERE status='RUNNING'
                """);
    }

    private Session session(java.sql.ResultSet row) throws java.sql.SQLException {
        return new Session(row.getString("id"), row.getString("assistant_id"), row.getString("title"),
                row.getString("skill_text"), row.getString("skill_hash"), row.getString("engine"),
                row.getString("model"), row.getString("evidence"), row.getLong("created_at"), row.getString("creation_hash"));
    }

    /** 服务端快照，不直接作为 API 输出。 */
    public record Session(String id, String assistantId, String title, String skillText, String skillHash,
                          String engine, String model, String evidence, long createdAt, String creationHash) { }
    /** 公开任务状态，不存储资源凭据。 */
    public record Turn(String id, String requestId, String input, String output, String status,
                       String error, long createdAt) { }
}
