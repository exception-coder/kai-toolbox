package com.exceptioncoder.toolbox.claudechat.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.HashMap;
import java.util.Map;

/**
 * 本机历史会话的自定义别名：sdk_session_id → alias。
 * 叠加在 transcript 之上，不改 jsonl 文件；列表时有别名优先作标题。
 */
@Repository
public class SessionAliasRepository {

    private final JdbcTemplate jdbc;

    public SessionAliasRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 设置别名；alias 空白视为清除（回落到解析出的标题）。 */
    public void upsert(String sdkSessionId, String alias) {
        if (alias == null || alias.isBlank()) {
            delete(sdkSessionId);
            return;
        }
        jdbc.update("""
                INSERT INTO claude_chat_session_alias (sdk_session_id, alias, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(sdk_session_id) DO UPDATE SET alias = excluded.alias, updated_at = excluded.updated_at
                """, sdkSessionId, alias.trim(), System.currentTimeMillis());
    }

    public void delete(String sdkSessionId) {
        jdbc.update("DELETE FROM claude_chat_session_alias WHERE sdk_session_id = ?", sdkSessionId);
    }

    /** sdk_session_id → alias 全表，供历史列表左连。 */
    public Map<String, String> findAll() {
        Map<String, String> m = new HashMap<>();
        jdbc.query("SELECT sdk_session_id, alias FROM claude_chat_session_alias", rs -> {
            m.put(rs.getString("sdk_session_id"), rs.getString("alias"));
        });
        return m;
    }
}
