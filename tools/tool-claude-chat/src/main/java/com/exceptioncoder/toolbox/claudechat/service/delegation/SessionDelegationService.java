package com.exceptioncoder.toolbox.claudechat.service.delegation;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionAccessGrant;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionClientErrorCode;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionClientPrincipal;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionConnectionTicket;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionDelegationProfile;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionGrantAuditEvent;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionGrantException;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionInvitation;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionDelegationRepository;
import com.exceptioncoder.toolbox.common.auth.service.AuthUserService;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** 编排会话委托、邀请配对、访问令牌和一次性连接 ticket。 */
@Service
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class SessionDelegationService {

    private static final Duration INVITATION_TTL = Duration.ofMinutes(15);
    private static final Duration CONNECTION_TICKET_TTL = Duration.ofSeconds(30);
    private static final String ADMIN_ROLE = "ADMIN";

    private final SessionDelegationRepository repository;
    private final ClaudeChatSessionRepository sessionRepository;
    private final AuthUserService userService;
    private final SessionCredentialService credentials;
    private final SessionClientTokenService tokenService;
    private final SessionClientConnectionRegistry connections;

    public SessionDelegationService(SessionDelegationRepository repository,
                                    ClaudeChatSessionRepository sessionRepository,
                                    AuthUserService userService,
                                    SessionCredentialService credentials,
                                    SessionClientTokenService tokenService,
                                    SessionClientConnectionRegistry connections) {
        this.repository = repository;
        this.sessionRepository = sessionRepository;
        this.userService = userService;
        this.credentials = credentials;
        this.tokenService = tokenService;
        this.connections = connections;
    }

    /**
     * 创建绑定一个参与者和会话的授权，并返回仅展示一次的邀请码。
     *
     * @param actor 当前所有者或管理员
     * @param sessionId 会话 ID
     * @param subjectUserId 参与者用户 ID
     * @param profile 执行画像
     * @param expiresAt 授权失效时间
     * @param maxTurns 最大参与者回合数
     * @param maxInputBytes 单条输入字节上限
     * @param now 当前时间
     * @return 新授权和原始邀请码
     */
    @Transactional
    public CreatedDelegation create(AuthPrincipal actor, String sessionId, long subjectUserId,
                                    SessionDelegationProfile profile, Instant expiresAt, int maxTurns,
                                    int maxInputBytes, Instant now) {
        ClaudeChatSession session = requireOwner(actor, sessionId);
        userService.getById(subjectUserId);
        long ownerUserId = session.getUserId() == null ? actor.userId() : session.getUserId();
        SessionAccessGrant grant = SessionAccessGrant.create(UUID.randomUUID().toString(), sessionId,
                subjectUserId, ownerUserId, profile, expiresAt, maxTurns, maxInputBytes, now);
        String rawInvitation = credentials.issueRawCredential();
        SessionInvitation invitation = new SessionInvitation(UUID.randomUUID().toString(), grant.id(),
                credentials.hash(rawInvitation), min(now.plus(INVITATION_TTL), expiresAt), null, null,
                false, now, now);
        repository.insertGrant(grant);
        repository.insertInvitation(invitation);
        audit(grant.id(), actor.userId(), "GRANT_CREATED", "SUCCESS", null,
                "profile=" + profile.name(), now);
        return new CreatedDelegation(grant, rawInvitation, invitation.expiresAt());
    }

    /**
     * 读取当前所有者可管理的会话授权。
     *
     * @param actor 当前所有者或管理员
     * @param sessionId 会话 ID
     * @return 授权列表
     */
    public List<SessionAccessGrant> list(AuthPrincipal actor, String sessionId) {
        requireOwner(actor, sessionId);
        return repository.findGrantsBySession(sessionId);
    }

    /** 读取一个授权的有界审计元数据。 */
    public List<SessionGrantAuditEvent> audit(AuthPrincipal actor, String sessionId, String grantId,
                                              Instant before, int limit) {
        requireOwner(actor, sessionId);
        requireGrant(grantId, sessionId);
        return repository.findAudit(grantId, before, limit);
    }

    /**
     * 暂停授权。
     *
     * @param actor 当前所有者或管理员
     * @param sessionId 会话 ID
     * @param grantId 授权 ID
     * @param expectedVersion 期望版本
     * @param now 当前时间
     * @return 新授权快照
     */
    @Transactional
    public SessionAccessGrant pause(AuthPrincipal actor, String sessionId, String grantId,
                                    long expectedVersion, Instant now) {
        return transition(actor, sessionId, grantId, expectedVersion, now, Transition.PAUSE);
    }

    /**
     * 恢复授权。
     *
     * @param actor 当前所有者或管理员
     * @param sessionId 会话 ID
     * @param grantId 授权 ID
     * @param expectedVersion 期望版本
     * @param now 当前时间
     * @return 新授权快照
     */
    @Transactional
    public SessionAccessGrant resume(AuthPrincipal actor, String sessionId, String grantId,
                                     long expectedVersion, Instant now) {
        return transition(actor, sessionId, grantId, expectedVersion, now, Transition.RESUME);
    }

    /**
     * 永久撤销授权并撤销未使用邀请。
     *
     * @param actor 当前所有者或管理员
     * @param sessionId 会话 ID
     * @param grantId 授权 ID
     * @param expectedVersion 期望版本
     * @param now 当前时间
     * @return 新授权快照
     */
    @Transactional
    public SessionAccessGrant revoke(AuthPrincipal actor, String sessionId, String grantId,
                                     long expectedVersion, Instant now) {
        return transition(actor, sessionId, grantId, expectedVersion, now, Transition.REVOKE);
    }

    /**
     * 重新签发邀请码，同时使旧的未消费邀请失效。
     *
     * @param actor 当前所有者或管理员
     * @param sessionId 会话 ID
     * @param grantId 授权 ID
     * @param now 当前时间
     * @return 仅展示一次的新邀请码
     */
    @Transactional
    public IssuedInvitation reissueInvitation(AuthPrincipal actor, String sessionId, String grantId, Instant now) {
        requireOwner(actor, sessionId);
        SessionAccessGrant grant = requireGrant(grantId, sessionId);
        grant.requireAccess(grant.subjectUserId(), sessionId, now);
        repository.revokeInvitations(grantId, now);
        String rawInvitation = credentials.issueRawCredential();
        SessionInvitation invitation = new SessionInvitation(UUID.randomUUID().toString(), grantId,
                credentials.hash(rawInvitation), min(now.plus(INVITATION_TTL), grant.expiresAt()),
                null, null, false, now, now);
        repository.insertInvitation(invitation);
        audit(grantId, actor.userId(), "INVITATION_REISSUED", "SUCCESS", null, null, now);
        return new IssuedInvitation(rawInvitation, invitation.expiresAt());
    }

    /**
     * 由已登录参与者单次兑换邀请。
     *
     * @param subject 当前 Forge 用户
     * @param rawInvitation 原始邀请码
     * @param now 当前时间
     * @return grant-scoped 访问令牌
     */
    @Transactional
    public ExchangedAccess exchange(AuthPrincipal subject, String rawInvitation, Instant now) {
        if (subject == null) {
            throw invalidInvitation();
        }
        return exchange(subject.userId(), subject.jti(), rawInvitation, now, false);
    }

    /** 由已认证业务服务代表其映射的 Forge 用户兑换邀请。 */
    @Transactional
    public ExchangedAccess exchangeForRelay(long subjectUserId, String relayClientId,
                                             String rawInvitation, Instant now) {
        if (subjectUserId <= 0 || relayClientId == null || relayClientId.isBlank()) {
            throw invalidInvitation();
        }
        return exchange(subjectUserId, "relay:" + relayClientId, rawInvitation, now, true);
    }

    private ExchangedAccess exchange(long subjectUserId, String correlationId, String rawInvitation,
                                     Instant now, boolean relay) {
        String tokenHash = credentials.hash(rawInvitation);
        SessionInvitation invitation = repository.findInvitationByHash(tokenHash)
                .orElseThrow(SessionDelegationService::invalidInvitation);
        SessionAccessGrant grant = repository.findGrant(invitation.grantId())
                .orElseThrow(SessionDelegationService::invalidInvitation);
        try {
            invitation.requireConsumable(grant, subjectUserId, now);
            if (!repository.consumeInvitation(invitation.id(), subjectUserId, now)) {
                throw invalidInvitation();
            }
        } catch (SessionGrantException exception) {
            audit(grant.id(), subjectUserId, "INVITATION_EXCHANGE", "DENIED", correlationId, null, now);
            throw invalidInvitation();
        }
        SessionClientTokenService.IssuedToken issued = relay
                ? tokenService.issueForRelay(grant, now)
                : tokenService.issue(grant, now);
        audit(grant.id(), subjectUserId, "INVITATION_EXCHANGED", "SUCCESS", correlationId,
                relay ? "channel=relay" : "channel=direct", now);
        return new ExchangedAccess(issued.accessToken(), issued.expiresAt(), grant.id(), grant.sessionId());
    }

    /**
     * 使用 grant-scoped 身份换取短时单次 WebSocket ticket。
     *
     * @param principal Session Client 身份
     * @param now 当前时间
     * @return 原始 ticket 和失效时间
     */
    @Transactional
    public IssuedConnectionTicket issueConnectionTicket(SessionClientPrincipal principal, Instant now) {
        SessionAccessGrant grant = requireGrant(principal.grantId(), principal.sessionId())
                .requireAccess(principal.subjectUserId(), principal.sessionId(), now);
        String rawTicket = credentials.issueRawCredential();
        Instant expiresAt = min(now.plus(CONNECTION_TICKET_TTL), grant.expiresAt());
        SessionConnectionTicket ticket = new SessionConnectionTicket(UUID.randomUUID().toString(), grant.id(),
                principal.subjectUserId(), credentials.hash(rawTicket), expiresAt, null, now, now);
        repository.insertTicket(ticket);
        audit(grant.id(), principal.subjectUserId(), "CONNECTION_TICKET_ISSUED", "SUCCESS",
                principal.tokenId(), null, now);
        return new IssuedConnectionTicket(rawTicket, expiresAt);
    }

    /**
     * WebSocket 握手阶段单次消费 ticket 并重新检查 Grant。
     *
     * @param rawTicket URL 中的短时 ticket
     * @param now 当前时间
     * @return 连接绑定
     */
    @Transactional
    public ConnectionBinding consumeConnectionTicket(String rawTicket, Instant now) {
        SessionConnectionTicket ticket = repository.findTicketByHash(credentials.hash(rawTicket))
                .orElseThrow(SessionDelegationService::invalidTicket);
        if (ticket.consumedAt() != null || !ticket.expiresAt().isAfter(now)
                || !repository.consumeTicket(ticket.id(), now)) {
            throw invalidTicket();
        }
        SessionAccessGrant grant = repository.findGrant(ticket.grantId())
                .orElseThrow(SessionDelegationService::invalidTicket);
        grant.requireAccess(ticket.subjectUserId(), grant.sessionId(), now);
        audit(grant.id(), ticket.subjectUserId(), "CONNECTION_OPENED", "SUCCESS", ticket.id(), null, now);
        return new ConnectionBinding(grant.id(), grant.sessionId(), ticket.subjectUserId(), grant.profile(),
                grant.version());
    }

    /**
     * 解析并重新验证公共访问令牌。
     *
     * @param bearerToken Bearer token
     * @param now 当前时间
     * @return 已校验身份
     */
    public SessionClientPrincipal authenticate(String bearerToken, Instant now) {
        SessionClientPrincipal principal = tokenService.parse(bearerToken);
        requireGrant(principal.grantId(), principal.sessionId())
                .requireAccess(principal.subjectUserId(), principal.sessionId(), now);
        return principal;
    }

    private SessionAccessGrant transition(AuthPrincipal actor, String sessionId, String grantId,
                                          long expectedVersion, Instant now, Transition transition) {
        requireOwner(actor, sessionId);
        SessionAccessGrant current = requireGrant(grantId, sessionId);
        SessionAccessGrant updated = switch (transition) {
            case PAUSE -> current.pause(expectedVersion, now);
            case RESUME -> current.resume(expectedVersion, now);
            case REVOKE -> current.revoke(expectedVersion, now);
        };
        if (!repository.updateGrant(updated, expectedVersion)) {
            throw new SessionGrantException(SessionClientErrorCode.SESSION_VERSION_CONFLICT,
                    "授权状态已更新，请刷新后重试");
        }
        if (transition == Transition.REVOKE) {
            repository.revokeInvitations(grantId, now);
        }
        if (transition == Transition.PAUSE || transition == Transition.REVOKE) {
            connections.closeGrant(grantId, transition.name());
        }
        audit(grantId, actor.userId(), "GRANT_" + transition.name(), "SUCCESS", null, null, now);
        return updated;
    }

    private ClaudeChatSession requireOwner(AuthPrincipal actor, String sessionId) {
        if (actor == null) {
            throw new SessionGrantException(SessionClientErrorCode.AUTHENTICATION_REQUIRED, "需要登录");
        }
        ClaudeChatSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new SessionGrantException(SessionClientErrorCode.AUTHENTICATION_REQUIRED,
                        "会话不存在或无权访问"));
        if (!actor.hasAnyRole(ADMIN_ROLE)
                && (session.getUserId() == null || !session.getUserId().equals(actor.userId()))) {
            throw new SessionGrantException(SessionClientErrorCode.AUTHENTICATION_REQUIRED,
                    "会话不存在或无权访问");
        }
        return session;
    }

    private SessionAccessGrant requireGrant(String grantId, String sessionId) {
        SessionAccessGrant grant = repository.findGrant(grantId)
                .orElseThrow(() -> new SessionGrantException(SessionClientErrorCode.AUTHENTICATION_REQUIRED,
                        "授权不存在或无权访问"));
        if (!grant.sessionId().equals(sessionId)) {
            throw new SessionGrantException(SessionClientErrorCode.AUTHENTICATION_REQUIRED,
                    "授权不存在或无权访问");
        }
        return grant;
    }

    private void audit(String grantId, Long actorUserId, String action, String result,
                       String correlationId, String detail, Instant now) {
        repository.insertAudit(new SessionGrantAuditEvent(UUID.randomUUID().toString(), grantId, actorUserId,
                action, result, correlationId, detail, now, now));
    }

    private static SessionGrantException invalidInvitation() {
        return new SessionGrantException(SessionClientErrorCode.INVITATION_INVALID,
                "邀请无效、已使用或已过期");
    }

    private static SessionGrantException invalidTicket() {
        return new SessionGrantException(SessionClientErrorCode.CONNECTION_TICKET_INVALID,
                "连接 ticket 无效、已使用或已过期");
    }

    private static Instant min(Instant left, Instant right) {
        return left.isBefore(right) ? left : right;
    }

    private enum Transition {
        PAUSE,
        RESUME,
        REVOKE
    }

    /** 新授权及只展示一次的邀请码。 */
    public record CreatedDelegation(SessionAccessGrant grant, String invitationCode, Instant invitationExpiresAt) {
    }

    /** 重新签发且只展示一次的邀请码。 */
    public record IssuedInvitation(String invitationCode, Instant expiresAt) {
    }

    /** 邀请兑换后的公共访问凭据。 */
    public record ExchangedAccess(String accessToken, Instant expiresAt, String grantId, String sessionId) {
    }

    /** 短时单次 WebSocket ticket。 */
    public record IssuedConnectionTicket(String ticket, Instant expiresAt) {
    }

    /** WebSocket 与 Grant、用户、会话的不可变绑定。 */
    public record ConnectionBinding(String grantId, String sessionId, long subjectUserId,
                                    SessionDelegationProfile profile, long sessionVersion) {
    }
}
