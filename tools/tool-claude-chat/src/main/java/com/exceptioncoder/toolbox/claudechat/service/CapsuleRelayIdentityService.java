package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.service.delegation.SessionRelayClientAuthenticator;
import com.exceptioncoder.toolbox.common.auth.service.AuthUserService;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import java.util.List;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

/** 客户端凭据和宿主身份共同决定胶囊会话归属，客户端不能指定 Forge 用户。 */
@Service
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class CapsuleRelayIdentityService {
    private final SessionRelayClientAuthenticator clients;
    private final AuthUserService users;
    private final ProjectRouteBindingService projects;

    public CapsuleRelayIdentityService(SessionRelayClientAuthenticator clients, AuthUserService users,
            ProjectRouteBindingService projects) {
        this.clients = clients;
        this.users = users;
        this.projects = projects;
    }

    public Identity authenticate(String authorization, long participantId) {
        String clientId = clients.authenticate(authorization);
        projects.resolve(clientId);
        var user = users.resolveClientIdentity(clientId, participantId);
        return new Identity(clientId, new AuthPrincipal(user.getId(), user.getUsername(), List.of(), List.of(),
                "capsule", Instant.now().plusSeconds(3600).getEpochSecond()));
    }

    public record Identity(String projectKey, AuthPrincipal principal) { }
}
