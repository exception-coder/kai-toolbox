package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.SessionStatus;
import com.exceptioncoder.toolbox.claudechat.repository.AuthSessionLinkRepository;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionCopyRepository;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import java.util.Locale;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/** 配置复制只落库；引擎连接由后续切会话独立负责，不调用 Sidecar 或复制历史。 */
@Service
@Slf4j
public class SessionConfigurationCopyService {
    private final ClaudeChatSessionRepository sessions;
    private final ClaudeSessionOptionsService claudeOptions;
    private final SessionCopyRepository copies;
    private final AuthSessionLinkRepository links;
    private final SessionProjectDirectoryService directories;
    private final ClaudeChatSessionAccessPolicy access;
    private final TransactionTemplate transaction;

    public SessionConfigurationCopyService(ClaudeChatSessionRepository sessions, SessionCopyRepository copies,
            AuthSessionLinkRepository links, SessionProjectDirectoryService directories,
            ClaudeChatSessionAccessPolicy access, PlatformTransactionManager transactions,
            ClaudeSessionOptionsService claudeOptions) {
        this.sessions = sessions;
        this.claudeOptions = claudeOptions;
        this.copies = copies;
        this.links = links;
        this.directories = directories;
        this.access = access;
        this.transaction = new TransactionTemplate(transactions);
    }

    public record Result(String requestId, String sourceSessionId, String targetSessionId) {}

    /** 单机应用内串行至事务提交；数据库唯一键与事务使重启后的重试也只返回原副本。 */
    public synchronized Result copy(String sourceId, String requestId) {
        if (requestId == null || !requestId.matches("[0-9a-fA-F-]{36}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "缺少有效的复制请求编号");
        }
        Long ownerId = AuthContext.current().map(principal -> principal.userId()).orElse(null);
        String ownerKey = ownerId == null ? "local" : "user:" + ownerId;
        return transaction.execute(status -> {
            var receipt = copies.find(ownerKey, requestId);
            if (receipt.isPresent()) {
                var saved = receipt.get();
                if (!sourceId.equals(saved.sourceSessionId())) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "复制请求编号已用于其他源会话");
                }
                if (sessions.findById(saved.targetSessionId()).isEmpty()) {
                    throw new ResponseStatusException(HttpStatus.GONE, "该请求的副本已被删除，不会自动重新创建");
                }
                if (!access.canAccessCurrentUser(saved.targetSessionId())) {
                    throw new ResponseStatusException(HttpStatus.FORBIDDEN, "副本当前不可访问");
                }
                return new Result(requestId, sourceId, saved.targetSessionId());
            }
            if (!access.canAccessCurrentUser(sourceId)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "源会话不存在或无权访问");
            }
            ClaudeChatSession source = sessions.findById(sourceId).orElseThrow();
            String policy = SessionExecutionPolicy.CONSULT_GROUP_NAME.equals(source.getGroupName())
                    ? SessionExecutionPolicy.CONSULT_READONLY : SessionExecutionPolicy.normalize(source.getExecutionPolicy());
            if (!SessionExecutionPolicy.canBind(SessionExecutionPolicy.STANDARD, policy)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "该会话不能通过编程入口复制");
            }
            String targetId = UUID.randomUUID().toString();
            long now = System.currentTimeMillis();
            String title = source.getTitle() == null || source.getTitle().isBlank()
                    ? null : source.getTitle().trim() + "（副本）";
            String effort = source.getCodexReasoningEffort();
            sessions.insert(ClaudeChatSession.builder().id(targetId).userId(ownerId)
                    .cwd(source.getCwd()).title(title).engine(source.getEngine())
                    .apiBaseUrl(source.getApiBaseUrl()).authToken(source.getAuthToken()).codexHome(source.getCodexHome())
                    .selectedModel(source.getSelectedModel())
                    .codexReasoningEffort(effort != null && effort.matches("[a-z][a-z0-9_-]{0,31}") ? effort : "low")
                    .codexSpeed("fast".equals(source.getCodexSpeed()) ? "fast" : "default")
                    .executionPolicy(policy).consultEvidenceSystems(source.getConsultEvidenceSystems())
                    .status(SessionStatus.IDLE).startedAt(now).lastSeenAt(now).build());
            sessions.updateGroup(targetId, source.getGroupName(), source.getSubgroupName());
            String authKey = source.getCodexHome() == null || source.getCodexHome().isBlank()
                    ? "__default__" : java.nio.file.Path.of(source.getCodexHome())
                        .toAbsolutePath().normalize().toString().toLowerCase(Locale.ROOT);
            if (!links.bind(targetId, targetId, authKey, now)) {
                throw new IllegalStateException("副本授权链路保存失败");
            }
            directories.copy(sourceId, targetId);
            claudeOptions.copy(sourceId, targetId);
            copies.insert(ownerKey, requestId, sourceId, targetId, now);
            log.info("[session-copy] request={} source={} target={}", requestId, sourceId, targetId);
            return new Result(requestId, sourceId, targetId);
        });
    }
}
