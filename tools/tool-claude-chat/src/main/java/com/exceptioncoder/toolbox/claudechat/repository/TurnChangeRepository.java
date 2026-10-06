package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.service.changes.TurnChangeRecord;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

/** 会话下按轮次幂等保存 Git 观察记录，分页查询不读取其他会话。 */
@Repository
public class TurnChangeRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    public TurnChangeRepository(JdbcTemplate jdbc, ObjectMapper mapper) { this.jdbc = jdbc; this.mapper = mapper; }
    /** 首次开始记录基线，重复事件不覆盖既有记录。 */
    public void begin(String sessionId, TurnChangeRecord record) {
        jdbc.update("INSERT OR IGNORE INTO claude_chat_turn_change(session_id,turn_id,started_at,payload) VALUES(?,?,?,?)",
                sessionId, record.turnId(), record.startedAt(), encode(record));
    }
    /** 更新同一平台轮次的终态。 */
    public void finish(String sessionId, TurnChangeRecord record) {
        jdbc.update("UPDATE claude_chat_turn_change SET payload=? WHERE session_id=? AND turn_id=?",
                encode(record), sessionId, record.turnId());
    }
    /** 获取精确轮次，供终态采集使用。 */
    public Optional<TurnChangeRecord> find(String sessionId, String turnId) {
        return jdbc.query("SELECT payload FROM claude_chat_turn_change WHERE session_id=? AND turn_id=?",
                (rs, index) -> decode(rs.getString(1)), sessionId, turnId).stream().findFirst();
    }
    /** 参数化检索和有界分页；查询串按字面匹配。 */
    public List<TurnChangeRecord> list(String sessionId, String query, String turnId, int offset) {
        return jdbc.query("""
                SELECT payload FROM claude_chat_turn_change
                WHERE session_id=? AND instr(lower(payload),lower(?))>0 AND (?='' OR turn_id=?)
                ORDER BY started_at DESC, turn_id DESC LIMIT 21 OFFSET ?
                """, (rs, index) -> decode(rs.getString(1)), sessionId, query, turnId, turnId, offset);
    }
    private String encode(TurnChangeRecord record) {
        try { return mapper.writeValueAsString(record); }
        catch (Exception exception) { throw new IllegalStateException("变更记录无法保存", exception); }
    }
    private TurnChangeRecord decode(String json) {
        try { return mapper.readValue(json, TurnChangeRecord.class); }
        catch (Exception exception) { throw new IllegalStateException("变更记录无法读取", exception); }
    }
}
