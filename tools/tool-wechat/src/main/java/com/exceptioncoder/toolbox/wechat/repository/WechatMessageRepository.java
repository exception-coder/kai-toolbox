package com.exceptioncoder.toolbox.wechat.repository;

import com.exceptioncoder.toolbox.wechat.api.dto.ChatListItem;
import com.exceptioncoder.toolbox.wechat.api.dto.StoredMessage;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;

/** 微信消息仓储。监听到的新消息落这张表，供人在外面翻历史 / 检索。 */
@Repository
public class WechatMessageRepository {

    private static final RowMapper<StoredMessage> MAPPER = (rs, n) -> new StoredMessage(
            rs.getLong("id"),
            rs.getString("chat"),
            rs.getString("sender"),
            rs.getString("content"),
            rs.getString("type"),
            rs.getString("sent_time"),
            rs.getString("msg_id"),
            rs.getLong("created_at"));

    private final JdbcTemplate jdbc;

    public WechatMessageRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 插入一条消息，返回是否真的写入（false = 因 msg_id 去重被忽略）。
     * msg_id 为空时不参与去重（wxauto 部分版本不给 id），靠时间顺序追加。
     */
    public boolean insertIfAbsent(String chat, String sender, String content, String type,
                                  String sentTime, String msgId, long createdAt) {
        if (msgId != null && !msgId.isBlank()) {
            Integer dup = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM wechat_message WHERE msg_id = ?", Integer.class, msgId);
            if (dup != null && dup > 0) {
                return false;
            }
        }
        jdbc.update("""
                INSERT INTO wechat_message (chat, sender, content, type, sent_time, msg_id, created_at)
                VALUES (?,?,?,?,?,?,?)
                """, chat, sender, content, type, sentTime, msgId, createdAt);
        return true;
    }

    public List<StoredMessage> listByChat(String chat, int limit) {
        return jdbc.query("""
                SELECT * FROM (
                    SELECT * FROM wechat_message WHERE chat = ? ORDER BY id DESC LIMIT ?
                ) ORDER BY id ASC
                """, MAPPER, chat, limit);
    }

    public List<StoredMessage> search(String keyword, int limit) {
        String like = "%" + keyword + "%";
        return jdbc.query("""
                SELECT * FROM wechat_message
                WHERE content LIKE ? OR sender LIKE ? OR chat LIKE ?
                ORDER BY id DESC LIMIT ?
                """, MAPPER, like, like, like, limit);
    }

    /**
     * 最近活跃会话（按该会话最新消息倒序），带末条消息预览 + 时间，供微信首页样式渲染。
     * 用「每个 chat 的 MAX(id)」自连接取到末条消息本身（id 自增，等价于时间序）。
     */
    public List<ChatListItem> recentChats(int limit) {
        return jdbc.query("""
                SELECT m.chat, m.sender, m.content, m.type, m.created_at
                FROM wechat_message m
                JOIN (SELECT chat, MAX(id) AS max_id FROM wechat_message GROUP BY chat) t
                  ON m.id = t.max_id
                ORDER BY m.created_at DESC
                LIMIT ?
                """, (rs, n) -> new ChatListItem(
                        rs.getString("chat"),
                        rs.getString("sender"),
                        rs.getString("content"),
                        rs.getString("type"),
                        rs.getLong("created_at")), limit);
    }
}
