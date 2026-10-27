package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.exceptioncoder.toolbox.claudechat.api.dto.MessagePage;
import com.exceptioncoder.toolbox.llm.spi.ConsultationHistoryReader;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Collections;
import java.util.List;
import java.util.Optional;

/** Chat-owned journal and account segments; no access to consultation-owned tables. */
@Repository
public class ConsultRuntimeRepository implements ConsultationHistoryReader {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public ConsultRuntimeRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public boolean imported(String session) {
        return !jdbc.queryForList("SELECT session_id FROM claude_consult_history_state WHERE session_id = ? AND imported = 1", String.class, session).isEmpty();
    }

    public void imported(String session, String gap) {
        jdbc.update("INSERT INTO claude_consult_history_state(session_id, imported, gap) VALUES (?, 1, ?) ON CONFLICT(session_id) DO UPDATE SET imported=1, gap=excluded.gap", session, gap);
    }

    public String gap(String session) {
        return jdbc.query("SELECT gap FROM claude_consult_history_state WHERE session_id = ?", (rs, i) -> rs.getString(1), session)
                .stream().filter(java.util.Objects::nonNull).findFirst().orElse(null);
    }

    public void importMessage(String session, ChatMessageView message) {
        try {
            if ("tool".equals(message.kind()) && message.input() == null) {
                var old = jdbc.query("SELECT payload FROM claude_consult_history WHERE session_id=? AND entry_key=?",
                        (rs, i) -> rs.getString(1), session, "legacy:" + message.id()).stream().findFirst();
                if (old.isPresent() && old.get() != null) {
                    var previous = mapper.readValue(old.get(), ChatMessageView.class);
                    message = ChatMessageView.tool(message.id(), message.toolName(), previous.input(), message.output(), message.isError(), message.ts());
                }
            }
            String text = message.text() == null ? mapper.writeValueAsString(message) : message.text();
            jdbc.update("INSERT INTO claude_consult_history(session_id, entry_key, kind, text, payload, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(session_id, entry_key) DO UPDATE SET text=excluded.text, payload=excluded.payload",
                    session, "legacy:" + message.id(), message.kind(), text, mapper.writeValueAsString(message),
                    message.ts() == null ? 0 : message.ts());
        } catch (com.fasterxml.jackson.core.JsonProcessingException error) {
            throw new IllegalStateException("无法保存咨询历史", error);
        }
    }

    public void append(String session, String key, String kind, String text, boolean replace) {
        jdbc.update("""
                INSERT INTO claude_consult_history(session_id, entry_key, kind, text, created_at) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(session_id, entry_key) DO UPDATE SET text =
                    CASE WHEN ? THEN excluded.text ELSE claude_consult_history.text || excluded.text END
                """, session, key, kind, text == null ? "" : text, System.currentTimeMillis(), replace);
    }

    public MessagePage messages(String session, Integer before, int limit) {
        var rows = jdbc.query("""
                SELECT seq, kind, text, payload, created_at FROM claude_consult_history
                WHERE session_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?
                """, (rs, i) -> {
            long seq = rs.getLong("seq");
            ChatMessageView message;
            if (rs.getString("payload") != null) {
                try { message = mapper.readValue(rs.getString("payload"), ChatMessageView.class); }
                catch (com.fasterxml.jackson.core.JsonProcessingException error) { throw new IllegalStateException(error); }
            } else if ("reference".equals(rs.getString("kind"))) {
                message = ChatMessageView.tool("consult:" + seq, "历史文件引用", null, rs.getString("text"), false, rs.getLong("created_at"));
            } else {
                message = "user".equals(rs.getString("kind"))
                        ? ChatMessageView.user("consult:" + seq, rs.getString("text"), rs.getLong("created_at"))
                        : ChatMessageView.assistant("consult:" + seq, rs.getString("text"), rs.getLong("created_at"));
            }
            return new Row((int) seq, message);
        }, session, before == null ? Integer.MAX_VALUE : before, Math.max(1, Math.min(100, limit)));
        Collections.reverse(rows);
        Integer next = rows.isEmpty() ? null : rows.getFirst().seq();
        if (next != null && jdbc.queryForObject("SELECT COUNT(*) FROM claude_consult_history WHERE session_id=? AND seq < ?", Integer.class, session, next) == 0) next = null;
        return new MessagePage(rows.stream().map(Row::message).toList(), next, false, null, gap(session));
    }

    private record Row(int seq, ChatMessageView message) { }

    public Optional<Segment> latest(String session) {
        return jdbc.query("SELECT segment_id, codex_home, native_id FROM claude_consult_segment WHERE session_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1",
                (rs, i) -> new Segment(rs.getString("segment_id"), rs.getString("codex_home"), rs.getString("native_id")), session).stream().findFirst();
    }

    public Optional<String> sessionForNative(String nativeId) {
        var ids = jdbc.queryForList("SELECT DISTINCT session_id FROM claude_consult_segment WHERE native_id=?", String.class, nativeId);
        if (ids.size() > 1) throw new IllegalArgumentException("原生句柄存在歧义，请从原咨询入口读取历史");
        return ids.stream().findFirst();
    }

    public void segment(String id, String session, String home, String nativeId, long version) {
        jdbc.update("INSERT OR IGNORE INTO claude_consult_segment(segment_id, session_id, codex_home, native_id, policy_version, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                id, session, home, nativeId, version, System.currentTimeMillis());
    }

    public void initialized(String segment, String nativeId) {
        jdbc.update("UPDATE claude_consult_segment SET native_id=? WHERE segment_id=? AND native_id IS NULL", nativeId, segment);
    }

    public record Segment(String id, String home, String nativeId) { }

    public boolean hasRequest(String session, String request) {
        return !jdbc.queryForList("SELECT request_id FROM claude_consult_request WHERE session_id=? AND request_id=?", String.class, session, request).isEmpty();
    }

    public void request(String session, String request, String turn, String segment, String home, long version) {
        jdbc.update("INSERT INTO claude_consult_request(session_id, request_id, turn_id, segment_id, codex_home, policy_version, state, created_at) VALUES (?, ?, ?, ?, ?, ?, 'DISPATCHING', ?)",
                session, request, turn, segment, home, version, System.currentTimeMillis());
    }

    public void settled(String session, String turn, String state) {
        jdbc.update("UPDATE claude_consult_request SET state=? WHERE session_id=? AND turn_id=?", state, session, turn);
        // This is the journal/index boundary, never proof the model read every historical raw record.
        jdbc.update("UPDATE claude_consult_segment SET context_index_seq=COALESCE((SELECT MAX(seq) FROM claude_consult_history WHERE session_id=?),0) WHERE segment_id IN (SELECT segment_id FROM claude_consult_request WHERE session_id=? AND turn_id=?)", session, session, turn);
    }

    /** Exact evidence index, not an LLM assertion that a historical conclusion is true. */
    public String contextIndex(String session) {
        var entries = jdbc.query("""
                SELECT seq, kind, length(text) AS size, substr(text,1,600) AS excerpt,
                       CASE WHEN kind='user' THEN '用户目标/业务条件/修正'
                            WHEN kind='tool' OR kind='reference' THEN 'SQL/工具依据/原文件引用'
                            ELSE '历史结论/假设/未解决事项' END AS category
                FROM claude_consult_history WHERE session_id=? ORDER BY seq DESC LIMIT 24
                """, (rs, i) -> new IndexEntry(rs.getLong("seq"), rs.getString("kind"), rs.getInt("size"),
                        rs.getString("excerpt"), rs.getString("category")), session);
        StringBuilder index = new StringBuilder("结构化原文索引（摘录不是事实核验或完整语义摘要）：\n");
        Collections.reverse(entries);
        long first = entries.isEmpty() ? Long.MAX_VALUE : entries.getFirst().seq();
        long offset = jdbc.queryForObject("SELECT COALESCE(SUM(length(text)+length(kind)+length(CAST(seq AS TEXT))+6),0) FROM claude_consult_history WHERE session_id=? AND seq<?", Long.class, session, first);
        long earlier = offset;
        for (int i = 0; i < entries.size(); i++) {
            var entry = entries.get(i);
            int heading = ("\n[" + entry.kind() + " #" + entry.seq() + "]\n").length();
            index.append(entry.category()).append("：offset=").append(offset)
                    .append("，原文字符数=").append(entry.size()).append("，摘录=").append(entry.excerpt()).append('\n');
            offset += heading + entry.size();
        }
        if (earlier > 0) index.append("还有早期资料未在索引展开；涉及旧条件时从 offset=0 分页核对，不得假定已全部恢复。\n");
        return index.toString();
    }

    private record IndexEntry(long seq, String kind, int size, String excerpt, String category) { }

    /** Uses SQLite character slicing, preserving full SQL in storage without loading it all in a prompt. */
    @Override
    public Page read(String session, int offset, int maxChars) {
        if (offset < 0 || maxChars < 1 || maxChars > 50000) throw new IllegalArgumentException("历史分页参数无效");
        long total = jdbc.queryForObject("SELECT COALESCE(SUM(length(text)+length(kind)+length(CAST(seq AS TEXT))+6),0) FROM claude_consult_history WHERE session_id=?", Long.class, session);
        var pieces = jdbc.query("""
                WITH sizes AS (
                  SELECT seq, length(text)+length(kind)+length(CAST(seq AS TEXT))+6 AS size
                  FROM claude_consult_history WHERE session_id=?
                ), positions AS (
                  SELECT seq, size, SUM(size) OVER (ORDER BY seq)-size AS start FROM sizes
                )
                SELECT substr(char(10)||'['||h.kind||' #'||h.seq||']'||char(10)||h.text,
                              MAX(1,?-p.start+1), ?-MAX(0,p.start-?))
                FROM positions p JOIN claude_consult_history h ON h.seq=p.seq
                WHERE p.start<? AND p.start+p.size>? ORDER BY p.seq
                """, (rs, i) -> rs.getString(1), session, offset, maxChars, offset, (long) offset + maxChars, offset);
        String result = String.join("", pieces);
        int next = offset + result.codePointCount(0, result.length());
        return new Page(offset, next, next >= total, result, gap(session));
    }
}
