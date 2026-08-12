package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.SessionCustomSite;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

/** 持久化 Vibe Coding 会话与快捷站点之间的逻辑关联。 */
@Repository("claudeChatSessionSiteRepository")
public class SessionSiteRepository {

    private final JdbcTemplate jdbc;

    public SessionSiteRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 按用户设置的顺序读取会话关联站点 ID。
     *
     * @param sessionId 逻辑会话 ID
     * @return 快捷站点 ID 列表
     */
    public List<String> findSiteIds(String sessionId) {
        return jdbc.queryForList("""
                SELECT site_id
                FROM claude_chat_session_site
                WHERE session_id = ?
                ORDER BY sort_order, create_time
                """, String.class, sessionId);
    }

    /**
     * 按用户设置的顺序读取会话临时站点。
     *
     * @param sessionId 逻辑会话 ID
     * @return 临时站点列表
     */
    public List<SessionCustomSite> findCustomSites(String sessionId) {
        return jdbc.query("""
                SELECT id, title, site_url
                FROM claude_chat_session_custom_site
                WHERE session_id = ?
                ORDER BY sort_order, create_time
                """, (resultSet, rowNum) -> new SessionCustomSite(
                resultSet.getString("id"),
                resultSet.getString("title"),
                resultSet.getString("site_url")), sessionId);
    }

    /**
     * 用完整的新列表替换会话关联，保证排序和删除结果一致。
     *
     * @param sessionId 逻辑会话 ID
     * @param siteIds 快捷站点 ID 列表
     * @param now 当前毫秒时间戳
     */
    public void replace(String sessionId, List<String> siteIds, long now) {
        jdbc.update("DELETE FROM claude_chat_session_site WHERE session_id = ?", sessionId);
        for (int index = 0; index < siteIds.size(); index++) {
            jdbc.update("""
                    INSERT INTO claude_chat_session_site
                        (id, session_id, site_id, sort_order, create_time, update_time)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """, UUID.randomUUID().toString(), sessionId, siteIds.get(index), index, now, now);
        }
    }

    /**
     * 用完整的新列表替换会话临时站点。
     *
     * @param sessionId 逻辑会话 ID
     * @param customSites 已规范化的临时站点
     * @param now 当前毫秒时间戳
     */
    public void replaceCustomSites(String sessionId, List<SessionCustomSite> customSites, long now) {
        jdbc.update("DELETE FROM claude_chat_session_custom_site WHERE session_id = ?", sessionId);
        for (int index = 0; index < customSites.size(); index++) {
            SessionCustomSite site = customSites.get(index);
            jdbc.update("""
                    INSERT INTO claude_chat_session_custom_site
                        (id, session_id, title, site_url, sort_order, create_time, update_time)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, site.id(), sessionId, site.title(), site.siteUrl(), index, now, now);
        }
    }

    /** 删除会话时同步清理其站点关联。 */
    public void deleteBySessionId(String sessionId) {
        jdbc.update("DELETE FROM claude_chat_session_site WHERE session_id = ?", sessionId);
        jdbc.update("DELETE FROM claude_chat_session_custom_site WHERE session_id = ?", sessionId);
    }
}
