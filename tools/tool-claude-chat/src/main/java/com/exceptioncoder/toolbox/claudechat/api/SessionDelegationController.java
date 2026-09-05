package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionAccessGrant;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionDelegationProfile;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionGrantAuditEvent;
import com.exceptioncoder.toolbox.claudechat.service.delegation.SessionDelegationService;
import com.exceptioncoder.toolbox.claudechat.service.delegation.SessionClientConnectionRegistry;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;

import java.time.Instant;
import java.util.List;

/** Vibe Coding 会话所有者管理业务参与者委托的控制面。 */
@RequireAuth
@RestController
@RequestMapping("/api/claude-chat/sessions/{sessionId}/delegations")
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class SessionDelegationController {

    private final SessionDelegationService service;
    private final SessionClientConnectionRegistry connections;

    public SessionDelegationController(SessionDelegationService service,
                                       SessionClientConnectionRegistry connections) {
        this.service = service;
        this.connections = connections;
    }

    /** 创建委托并返回仅展示一次的邀请码。 */
    @PostMapping
    public DelegationCreatedView create(@PathVariable String sessionId,
                                        @RequestBody CreateDelegationRequest request) {
        SessionDelegationService.CreatedDelegation created = service.create(current(), sessionId,
                request.subjectUserId(), request.profile(), request.expiresAt(), request.maxTurns(),
                request.maxInputBytes(), Instant.now());
        return new DelegationCreatedView(created.grant(), created.invitationCode(),
                created.invitationExpiresAt());
    }

    /** 列出当前会话的全部委托。 */
    @GetMapping
    public List<DelegationView> list(@PathVariable String sessionId) {
        return service.list(current(), sessionId).stream()
                .map(grant -> new DelegationView(grant, connections.connectionCount(grant.id())))
                .toList();
    }

    /** 暂停一个委托。 */
    @PostMapping("/{grantId}/pause")
    public SessionAccessGrant pause(@PathVariable String sessionId, @PathVariable String grantId,
                                    @RequestBody VersionRequest request) {
        return service.pause(current(), sessionId, grantId, request.expectedVersion(), Instant.now());
    }

    /** 恢复一个委托。 */
    @PostMapping("/{grantId}/resume")
    public SessionAccessGrant resume(@PathVariable String sessionId, @PathVariable String grantId,
                                     @RequestBody VersionRequest request) {
        return service.resume(current(), sessionId, grantId, request.expectedVersion(), Instant.now());
    }

    /** 永久撤销一个委托。 */
    @DeleteMapping("/{grantId}")
    public SessionAccessGrant revoke(@PathVariable String sessionId, @PathVariable String grantId,
                                     @RequestBody VersionRequest request) {
        return service.revoke(current(), sessionId, grantId, request.expectedVersion(), Instant.now());
    }

    /** 撤销旧邀请并签发新的短时单次邀请码。 */
    @PostMapping("/{grantId}/invitation")
    public InvitationView reissueInvitation(@PathVariable String sessionId, @PathVariable String grantId) {
        SessionDelegationService.IssuedInvitation issued = service.reissueInvitation(
                current(), sessionId, grantId, Instant.now());
        return new InvitationView(issued.invitationCode(), issued.expiresAt());
    }

    /** 分页读取不含消息正文和凭据的授权审计。 */
    @GetMapping("/{grantId}/audit")
    public List<SessionGrantAuditEvent> audit(@PathVariable String sessionId, @PathVariable String grantId,
                                              @RequestParam(required = false) Instant before,
                                              @RequestParam(defaultValue = "30") int limit) {
        return service.audit(current(), sessionId, grantId, before, limit);
    }

    private AuthPrincipal current() {
        return AuthContext.current().orElse(null);
    }

    /** 创建委托请求。 */
    public record CreateDelegationRequest(long subjectUserId, SessionDelegationProfile profile,
                                          Instant expiresAt, int maxTurns, int maxInputBytes) {
    }

    /** 乐观锁版本请求。 */
    public record VersionRequest(long expectedVersion) {
    }

    /** 新授权和仅展示一次的邀请码。 */
    public record DelegationCreatedView(SessionAccessGrant grant, String invitationCode,
                                        Instant invitationExpiresAt) {
    }

    /** 仅展示一次的新邀请码。 */
    public record InvitationView(String invitationCode, Instant expiresAt) {
    }

    /** 授权及当前公共连接数。 */
    public record DelegationView(SessionAccessGrant grant, int connectedClients) {
    }
}
