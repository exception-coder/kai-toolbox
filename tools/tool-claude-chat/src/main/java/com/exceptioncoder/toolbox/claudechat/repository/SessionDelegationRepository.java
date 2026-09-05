package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionAccessGrant;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionCommandReceipt;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionConnectionTicket;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionDelegationProfile;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionGrantAuditEvent;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionGrantStatus;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionInvitation;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionParticipantCommand;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/** 持久化会话委托授权、单次凭证、命令回执和审计元数据。 */
@Repository
public class SessionDelegationRepository {

    private static final String GRANT_COLUMNS = """
            id, session_id, subject_user_id, owner_user_id, profile, status, expires_at,
            max_turns, used_turns, max_input_bytes, version, create_time, update_time
            """;
    private static final String INVITATION_COLUMNS = """
            id, grant_id, token_hash, expires_at, consumed_at, consumed_by, revoked, create_time, update_time
            """;
    private static final String TICKET_COLUMNS = """
            id, grant_id, subject_user_id, token_hash, expires_at, consumed_at, create_time, update_time
            """;
    private static final String COMMAND_COLUMNS = """
            id, grant_id, command_id, command_type, session_version, result_json, create_time, update_time
            """;
    private static final String AUDIT_COLUMNS = """
            id, grant_id, actor_user_id, action, result, correlation_id, detail, create_time, update_time
            """;

    private static final RowMapper<SessionAccessGrant> GRANT_ROW = (rs, rowNum) -> new SessionAccessGrant(
            rs.getString("id"), rs.getString("session_id"), rs.getLong("subject_user_id"),
            rs.getLong("owner_user_id"), SessionDelegationProfile.valueOf(rs.getString("profile")),
            SessionGrantStatus.valueOf(rs.getString("status")), Instant.ofEpochMilli(rs.getLong("expires_at")),
            rs.getInt("max_turns"), rs.getInt("used_turns"), rs.getInt("max_input_bytes"),
            rs.getLong("version"), Instant.ofEpochMilli(rs.getLong("create_time")),
            Instant.ofEpochMilli(rs.getLong("update_time")));

    private static final RowMapper<SessionInvitation> INVITATION_ROW = (rs, rowNum) -> new SessionInvitation(
            rs.getString("id"), rs.getString("grant_id"), rs.getString("token_hash"),
            Instant.ofEpochMilli(rs.getLong("expires_at")), nullableInstant(rs.getObject("consumed_at")),
            nullableLong(rs.getObject("consumed_by")), rs.getInt("revoked") != 0,
            Instant.ofEpochMilli(rs.getLong("create_time")), Instant.ofEpochMilli(rs.getLong("update_time")));

    private static final RowMapper<SessionConnectionTicket> TICKET_ROW = (rs, rowNum) ->
            new SessionConnectionTicket(rs.getString("id"), rs.getString("grant_id"),
                    rs.getLong("subject_user_id"), rs.getString("token_hash"),
                    Instant.ofEpochMilli(rs.getLong("expires_at")), nullableInstant(rs.getObject("consumed_at")),
                    Instant.ofEpochMilli(rs.getLong("create_time")), Instant.ofEpochMilli(rs.getLong("update_time")));

    private static final RowMapper<SessionCommandReceipt> COMMAND_ROW = (rs, rowNum) -> new SessionCommandReceipt(
            rs.getString("id"), rs.getString("grant_id"), rs.getString("command_id"),
            SessionParticipantCommand.valueOf(rs.getString("command_type")), rs.getLong("session_version"),
            rs.getString("result_json"), Instant.ofEpochMilli(rs.getLong("create_time")),
            Instant.ofEpochMilli(rs.getLong("update_time")));

    private static final RowMapper<SessionGrantAuditEvent> AUDIT_ROW = (rs, rowNum) -> new SessionGrantAuditEvent(
            rs.getString("id"), rs.getString("grant_id"), nullableLong(rs.getObject("actor_user_id")),
            rs.getString("action"), rs.getString("result"), rs.getString("correlation_id"),
            rs.getString("detail"), Instant.ofEpochMilli(rs.getLong("create_time")),
            Instant.ofEpochMilli(rs.getLong("update_time")));

    private final JdbcTemplate jdbc;

    public SessionDelegationRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 新增授权。
     *
     * @param grant 授权快照
     */
    public void insertGrant(SessionAccessGrant grant) {
        jdbc.update("""
                INSERT INTO claude_chat_session_grant
                  (id, session_id, subject_user_id, owner_user_id, profile, status, expires_at,
                   max_turns, used_turns, max_input_bytes, version, create_time, update_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, grant.id(), grant.sessionId(), grant.subjectUserId(), grant.ownerUserId(),
                grant.profile().name(), grant.status().name(), grant.expiresAt().toEpochMilli(), grant.maxTurns(),
                grant.usedTurns(), grant.maxInputBytes(), grant.version(), grant.createdAt().toEpochMilli(),
                grant.updatedAt().toEpochMilli());
    }

    /**
     * 按 ID 读取授权。
     *
     * @param grantId 授权 ID
     * @return 授权快照
     */
    public Optional<SessionAccessGrant> findGrant(String grantId) {
        return jdbc.query("SELECT " + GRANT_COLUMNS + " FROM claude_chat_session_grant WHERE id = ?",
                GRANT_ROW, grantId).stream().findFirst();
    }

    /**
     * 读取一个会话的授权，最新修改优先。
     *
     * @param sessionId 会话 ID
     * @return 授权列表
     */
    public List<SessionAccessGrant> findGrantsBySession(String sessionId) {
        return jdbc.query("SELECT " + GRANT_COLUMNS + " FROM claude_chat_session_grant "
                        + "WHERE session_id = ? ORDER BY update_time DESC, id DESC",
                GRANT_ROW, sessionId);
    }

    /**
     * 使用乐观锁更新授权。
     *
     * @param grant 新授权快照
     * @param expectedVersion 原版本
     * @return 是否成功
     */
    public boolean updateGrant(SessionAccessGrant grant, long expectedVersion) {
        return jdbc.update("""
                UPDATE claude_chat_session_grant
                   SET status = ?, used_turns = ?, version = ?, update_time = ?
                 WHERE id = ? AND version = ?
                """, grant.status().name(), grant.usedTurns(), grant.version(), grant.updatedAt().toEpochMilli(),
                grant.id(), expectedVersion) == 1;
    }

    /**
     * 保存单次邀请。
     *
     * @param invitation 邀请摘要
     */
    public void insertInvitation(SessionInvitation invitation) {
        jdbc.update("""
                INSERT INTO claude_chat_session_invitation
                  (id, grant_id, token_hash, expires_at, consumed_at, consumed_by, revoked, create_time, update_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, invitation.id(), invitation.grantId(), invitation.tokenHash(),
                invitation.expiresAt().toEpochMilli(), epochMillis(invitation.consumedAt()), invitation.consumedBy(),
                invitation.revoked() ? 1 : 0, invitation.createdAt().toEpochMilli(),
                invitation.updatedAt().toEpochMilli());
    }

    /**
     * 按安全摘要读取邀请。
     *
     * @param tokenHash 邀请摘要
     * @return 邀请
     */
    public Optional<SessionInvitation> findInvitationByHash(String tokenHash) {
        return jdbc.query("SELECT " + INVITATION_COLUMNS
                        + " FROM claude_chat_session_invitation WHERE token_hash = ?",
                INVITATION_ROW, tokenHash).stream().findFirst();
    }

    /**
     * 原子消费一个仍有效的邀请。
     *
     * @param invitationId 邀请 ID
     * @param subjectUserId 消费用户 ID
     * @param now 当前时间
     * @return 是否成功消费
     */
    public boolean consumeInvitation(String invitationId, long subjectUserId, Instant now) {
        long timestamp = now.toEpochMilli();
        return jdbc.update("""
                UPDATE claude_chat_session_invitation
                   SET consumed_at = ?, consumed_by = ?, update_time = ?
                 WHERE id = ? AND consumed_at IS NULL AND revoked = 0 AND expires_at > ?
                """, timestamp, subjectUserId, timestamp, invitationId, timestamp) == 1;
    }

    /**
     * 撤销授权下所有未消费邀请。
     *
     * @param grantId 授权 ID
     * @param now 当前时间
     */
    public void revokeInvitations(String grantId, Instant now) {
        jdbc.update("""
                UPDATE claude_chat_session_invitation
                   SET revoked = 1, update_time = ?
                 WHERE grant_id = ? AND consumed_at IS NULL AND revoked = 0
                """, now.toEpochMilli(), grantId);
    }

    /**
     * 保存单次连接票据。
     *
     * @param ticket 票据摘要
     */
    public void insertTicket(SessionConnectionTicket ticket) {
        jdbc.update("""
                INSERT INTO claude_chat_session_ticket
                  (id, grant_id, subject_user_id, token_hash, expires_at, consumed_at, create_time, update_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, ticket.id(), ticket.grantId(), ticket.subjectUserId(), ticket.tokenHash(),
                ticket.expiresAt().toEpochMilli(), epochMillis(ticket.consumedAt()),
                ticket.createdAt().toEpochMilli(), ticket.updatedAt().toEpochMilli());
    }

    /**
     * 按安全摘要读取连接票据。
     *
     * @param tokenHash 票据摘要
     * @return 连接票据
     */
    public Optional<SessionConnectionTicket> findTicketByHash(String tokenHash) {
        return jdbc.query("SELECT " + TICKET_COLUMNS + " FROM claude_chat_session_ticket WHERE token_hash = ?",
                TICKET_ROW, tokenHash).stream().findFirst();
    }

    /**
     * 原子消费一个有效连接票据。
     *
     * @param ticketId 票据 ID
     * @param now 当前时间
     * @return 是否消费成功
     */
    public boolean consumeTicket(String ticketId, Instant now) {
        long timestamp = now.toEpochMilli();
        return jdbc.update("""
                UPDATE claude_chat_session_ticket
                   SET consumed_at = ?, update_time = ?
                 WHERE id = ? AND consumed_at IS NULL AND expires_at > ?
                """, timestamp, timestamp, ticketId, timestamp) == 1;
    }

    /**
     * 清理失效票据和已消费邀请。
     *
     * @param before 截止时间
     * @return 删除记录数
     */
    public int deleteExpiredCredentials(Instant before) {
        long timestamp = before.toEpochMilli();
        int tickets = jdbc.update("DELETE FROM claude_chat_session_ticket WHERE expires_at <= ?", timestamp);
        int invitations = jdbc.update("""
                DELETE FROM claude_chat_session_invitation
                 WHERE expires_at <= ? OR (consumed_at IS NOT NULL AND consumed_at <= ?)
                """, timestamp, timestamp);
        return tickets + invitations;
    }

    /**
     * 保存幂等命令回执；重复键返回 false。
     *
     * @param receipt 命令回执
     * @return 是否首次写入
     */
    public boolean insertCommandReceipt(SessionCommandReceipt receipt) {
        return jdbc.update("""
                INSERT OR IGNORE INTO claude_chat_session_command
                  (id, grant_id, command_id, command_type, session_version, result_json,
                   create_time, update_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, receipt.id(), receipt.grantId(), receipt.commandId(), receipt.commandType().name(),
                receipt.sessionVersion(), receipt.resultJson(), receipt.createdAt().toEpochMilli(),
                receipt.updatedAt().toEpochMilli()) == 1;
    }

    /**
     * 读取已执行命令回执。
     *
     * @param grantId 授权 ID
     * @param commandId 命令幂等 ID
     * @return 原始回执
     */
    public Optional<SessionCommandReceipt> findCommandReceipt(String grantId, String commandId) {
        return jdbc.query("SELECT " + COMMAND_COLUMNS + " FROM claude_chat_session_command "
                        + "WHERE grant_id = ? AND command_id = ?", COMMAND_ROW, grantId, commandId)
                .stream().findFirst();
    }

    /**
     * 保存有界审计元数据。
     *
     * @param event 审计事件
     */
    public void insertAudit(SessionGrantAuditEvent event) {
        jdbc.update("""
                INSERT INTO claude_chat_session_grant_audit
                  (id, grant_id, actor_user_id, action, result, correlation_id, detail,
                   create_time, update_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, event.id(), event.grantId(), event.actorUserId(), event.action(), event.result(),
                event.correlationId(), event.detail(), event.createdAt().toEpochMilli(),
                event.updatedAt().toEpochMilli());
    }

    /**
     * 按时间倒序读取授权审计。
     *
     * @param grantId 授权 ID
     * @param beforeExclusive 游标时间，可为空
     * @param limit 最大条数
     * @return 审计事件
     */
    public List<SessionGrantAuditEvent> findAudit(String grantId, Instant beforeExclusive, int limit) {
        long before = beforeExclusive == null ? Long.MAX_VALUE : beforeExclusive.toEpochMilli();
        int boundedLimit = Math.max(1, Math.min(limit, 100));
        return jdbc.query("SELECT " + AUDIT_COLUMNS + " FROM claude_chat_session_grant_audit "
                        + "WHERE grant_id = ? AND create_time < ? ORDER BY create_time DESC, id DESC LIMIT ?",
                AUDIT_ROW, grantId, before, boundedLimit);
    }

    private static Long epochMillis(Instant value) {
        return value == null ? null : value.toEpochMilli();
    }

    private static Instant nullableInstant(Object value) {
        return value == null ? null : Instant.ofEpochMilli(((Number) value).longValue());
    }

    private static Long nullableLong(Object value) {
        return value == null ? null : ((Number) value).longValue();
    }
}
