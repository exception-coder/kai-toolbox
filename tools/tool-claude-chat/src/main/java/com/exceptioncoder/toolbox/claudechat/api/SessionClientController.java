package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.AttachmentView;
import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.exceptioncoder.toolbox.claudechat.api.dto.MessagePage;
import com.exceptioncoder.toolbox.claudechat.api.dto.SessionAutopilotView;
import com.exceptioncoder.toolbox.claudechat.config.SessionClientProperties;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionAccessGrant;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionClientPrincipal;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionClientErrorCode;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionGrantException;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionDelegationRepository;
import com.exceptioncoder.toolbox.claudechat.service.AttachmentStorageService;
import com.exceptioncoder.toolbox.claudechat.service.SessionAutopilotService;
import com.exceptioncoder.toolbox.claudechat.service.SessionHistoryService;
import com.exceptioncoder.toolbox.claudechat.service.delegation.SessionDelegationService;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Instant;
import java.util.List;

/** 业务参与者使用的版本化 Session Client REST 数据面。 */
@RestController
@RequestMapping("/api/session-client/v1")
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class SessionClientController {

    private final SessionDelegationService delegations;
    private final SessionDelegationRepository delegationRepository;
    private final ClaudeChatSessionRepository sessionRepository;
    private final SessionHistoryService history;
    private final AttachmentStorageService attachments;
    private final SessionAutopilotService autopilot;
    private final SessionClientProperties properties;

    public SessionClientController(SessionDelegationService delegations,
                                   SessionDelegationRepository delegationRepository,
                                   ClaudeChatSessionRepository sessionRepository,
                                   SessionHistoryService history,
                                   AttachmentStorageService attachments,
                                   SessionAutopilotService autopilot,
                                   SessionClientProperties properties) {
        this.delegations = delegations;
        this.delegationRepository = delegationRepository;
        this.sessionRepository = sessionRepository;
        this.history = history;
        this.attachments = attachments;
        this.autopilot = autopilot;
        this.properties = properties;
    }

    /** 已登录 Forge 用户单次兑换会话邀请。 */
    @RequireAuth
    @PostMapping("/invitations/exchange")
    public SessionDelegationService.ExchangedAccess exchange(@RequestBody ExchangeRequest request) {
        requireEnabled();
        return delegations.exchange(AuthContext.current().orElse(null), request.invitationCode(), Instant.now());
    }

    /** 返回参与者可见的固定会话摘要和有效约束。 */
    @GetMapping("/session")
    public PublicSessionView session(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        SessionClientPrincipal principal = authenticate(authorization);
        SessionAccessGrant grant = delegationRepository.findGrant(principal.grantId())
                .orElseThrow(SessionClientController::unavailable);
        ClaudeChatSession session = sessionRepository.findById(principal.sessionId())
                .orElseThrow(SessionClientController::unavailable);
        SessionAutopilotView.Run run = autopilot.current(principal.sessionId()).orElse(null);
        PublicProgress progress = run == null ? null : new PublicProgress(
                run.state(), run.phase(), run.currentTaskId(), run.progress().completedTasks(),
                run.progress().totalTasks());
        return new PublicSessionView(session.getId(), session.getTitle(),
                session.getStatus() == null ? "UNKNOWN" : session.getStatus().name(),
                grant.profile(), grant.status(), grant.expiresAt(), grant.maxTurns(), grant.usedTurns(),
                grant.maxInputBytes(), grant.version(), progress);
    }

    /** 只返回 user/assistant 文本的分页历史，不泄漏工具或路径信息。 */
    @GetMapping("/messages")
    public PublicMessagePage messages(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                      @RequestParam(required = false) Integer before,
                                      @RequestParam(defaultValue = "30") int limit) {
        SessionClientPrincipal principal = authenticate(authorization);
        ClaudeChatSession session = sessionRepository.findById(principal.sessionId())
                .orElseThrow(SessionClientController::unavailable);
        MessagePage page = history.readMessages(session.getCwd(), session.getSdkSessionId(),
                session.getCodexHome(), before, Math.max(1, Math.min(limit, 100)));
        List<PublicMessageView> items = page.items().stream()
                .filter(item -> "user".equals(item.kind()) || "assistant".equals(item.kind()))
                .map(SessionClientController::projectMessage)
                .toList();
        return new PublicMessagePage(items, page.nextBefore(), page.transcriptMissing());
    }

    /** 上传授权会话附件，仅返回逻辑 ID 和展示元数据。 */
    @PostMapping("/attachments")
    public PublicAttachmentView upload(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                       @RequestPart("file") MultipartFile file) throws IOException {
        SessionClientPrincipal principal = authenticate(authorization);
        AttachmentView stored = attachments.store(principal.sessionId(), file);
        return new PublicAttachmentView(stored.id(), stored.name(), stored.mime(), stored.size());
    }

    /** 为浏览器 WebSocket 生成 30 秒单次连接 ticket。 */
    @PostMapping("/connections")
    public SessionDelegationService.IssuedConnectionTicket connection(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        return delegations.issueConnectionTicket(authenticate(authorization), Instant.now());
    }

    private SessionClientPrincipal authenticate(String authorization) {
        requireEnabled();
        return delegations.authenticate(bearer(authorization), Instant.now());
    }

    private void requireEnabled() {
        if (!properties.isEnabled()) {
            throw new SessionGrantException(SessionClientErrorCode.HOST_OFFLINE,
                    "Session Client 公共入口未启用");
        }
    }

    private static String bearer(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            return "";
        }
        return authorization.substring("Bearer ".length()).trim();
    }

    private static PublicMessageView projectMessage(ChatMessageView item) {
        return new PublicMessageView(item.id(), item.kind(), item.text(), item.ts());
    }

    private static SessionGrantException unavailable() {
        return new SessionGrantException(SessionClientErrorCode.AUTHENTICATION_REQUIRED,
                "会话授权不可用");
    }

    /** 邀请兑换请求。 */
    public record ExchangeRequest(String invitationCode) {
    }

    /** 参与者可见的固定会话摘要。 */
    public record PublicSessionView(String sessionId, String title, String status,
                                    com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionDelegationProfile profile,
                                    com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionGrantStatus grantStatus,
                                    Instant expiresAt, int maxTurns, int usedTurns, int maxInputBytes,
                                    long sessionVersion, PublicProgress progress) {
    }

    /** 参与者可见的自动监督进度。 */
    public record PublicProgress(String state, String phase, String currentTaskId,
                                 int completedTasks, int totalTasks) {
    }

    /** 参与者可见的消息。 */
    public record PublicMessageView(String id, String role, String text, Long timestamp) {
    }

    /** 参与者历史分页。 */
    public record PublicMessagePage(List<PublicMessageView> items, Integer nextBefore,
                                    boolean transcriptMissing) {
    }

    /** 不含服务器路径的附件句柄。 */
    public record PublicAttachmentView(String id, String name, String mime, long size) {
    }
}
