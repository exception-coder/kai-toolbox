package com.exceptioncoder.toolbox.claudechat.service;

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
    private static final long IDENTITY_LIFETIME_SECONDS = 3600;
    private final CapsuleRelayClientAuthenticator clients;
    private final AuthUserService users;
    private final ProjectRouteBindingService projects;

    public CapsuleRelayIdentityService(CapsuleRelayClientAuthenticator clients, AuthUserService users,
            ProjectRouteBindingService projects) {
        this.clients = clients;
        this.users = users;
        this.projects = projects;
    }

    /** 核验宿主、正整数参与者及项目绑定，复用原有内部用户以保持历史会话归属。 */
    public Identity authenticate(String authorization, long participantId) {
        if (participantId <= 0) {
            throw new IllegalArgumentException("胶囊参与者身份无效");
        }
        String clientId = clients.authenticate(authorization);
        projects.resolve(clientId);
        var user = users.resolveClientIdentity(clientId, participantId);
        return new Identity(clientId, new AuthPrincipal(user.getId(), user.getUsername(), List.of(), List.of(),
                "capsule", Instant.now().plusSeconds(IDENTITY_LIFETIME_SECONDS).getEpochSecond()));
    }

    /** 已认证胶囊归属；projectKey 为宿主项目标识，principal 为不带管理权限的内部用户。 */
    public record Identity(String projectKey, AuthPrincipal principal) { }
}
