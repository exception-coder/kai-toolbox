package com.exceptioncoder.toolbox.common.auth.service;

import com.exceptioncoder.toolbox.common.auth.AuthException;
import com.exceptioncoder.toolbox.common.auth.config.AuthProperties;
import com.exceptioncoder.toolbox.common.auth.domain.AuthUser;
import com.exceptioncoder.toolbox.common.auth.repository.AuthUserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

/**
 * 用户与角色领域服务：认证、建号、改密、首启动种子管理员。
 */
@Service
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class AuthUserService {

    private static final Logger log = LoggerFactory.getLogger(AuthUserService.class);
    private static final String DEFAULT_ROLE = "USER";

    private final AuthUserRepository repository;
    private final PasswordHasher passwordHasher;
    private final AuthProperties props;

    public AuthUserService(AuthUserRepository repository, PasswordHasher passwordHasher, AuthProperties props) {
        this.repository = repository;
        this.passwordHasher = passwordHasher;
        this.props = props;
    }

    /**
     * 账密校验。用户不存在与密码错误返回同一错误码，防用户名枚举。
     */
    public AuthUser authenticate(String username, String rawPassword) {
        AuthUser user = repository.findByUsername(username).orElseThrow(AuthException::badCredentials);
        if (!passwordHasher.verify(rawPassword, user.getPasswordHash())) {
            throw AuthException.badCredentials();
        }
        if (!user.isEnabled()) {
            throw AuthException.userDisabled();
        }
        return user;
    }

    public AuthUser create(String username, String rawPassword, List<String> roles, String realName) {
        if (repository.existsByUsername(username)) {
            throw AuthException.userExists();
        }
        long now = System.currentTimeMillis();
        AuthUser user = AuthUser.builder()
                .username(username)
                .passwordHash(passwordHasher.hash(rawPassword))
                .realName(realName == null || realName.isBlank() ? null : realName.trim())
                .roles(roles == null || roles.isEmpty() ? List.of(DEFAULT_ROLE) : roles)
                .enabled(true)
                .createdAt(now)
                .updatedAt(now)
                .build();
        long id = repository.insert(user);
        user.setId(id);
        return user;
    }

    public AuthUser updateRealName(long userId, String realName) {
        repository.updateRealName(userId,
                realName == null || realName.isBlank() ? null : realName.trim(),
                System.currentTimeMillis());
        return getById(userId);
    }

    public void changePassword(long userId, String oldPassword, String newPassword) {
        AuthUser user = repository.findById(userId).orElseThrow(AuthException::tokenInvalid);
        if (!passwordHasher.verify(oldPassword, user.getPasswordHash())) {
            throw AuthException.badCredentials();
        }
        repository.updatePassword(userId, passwordHasher.hash(newPassword), System.currentTimeMillis());
    }

    public AuthUser getById(long userId) {
        return repository.findById(userId).orElseThrow(AuthException::tokenInvalid);
    }

    /** 为已认证业务客户端的用户创建稳定的内部归属；不签发登录凭据。 */
    public synchronized AuthUser resolveClientIdentity(String clientId, long participantId) {
        if (clientId == null || clientId.isBlank() || participantId <= 0) {
            throw new IllegalArgumentException("客户端用户身份无效");
        }
        String name;
        try {
            byte[] hash = java.security.MessageDigest.getInstance("SHA-256")
                    .digest((clientId + ":" + participantId).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            name = "capsule-" + java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 不可用", exception);
        }
        AuthUser user = repository.findByUsername(name).orElse(null);
        if (user == null) {
            user = create(name, UUID.randomUUID() + UUID.randomUUID().toString(), List.of("USER"), clientId + " / " + participantId);
        }
        if (!user.isEnabled()) throw AuthException.userDisabled();
        return user;
    }

    // ===== 管理后台（ADMIN）：用户列表 / 角色 / 启停 / 重置密码 / 删除 =====
    // 注意：吊销 refresh 由 Controller 层调 TokenService 完成，避免 AuthUserService↔TokenService 循环依赖。

    public List<AuthUser> list() {
        return repository.findAll();
    }

    public AuthUser updateRoles(long userId, List<String> roles) {
        repository.updateRoles(userId, roles == null || roles.isEmpty() ? List.of(DEFAULT_ROLE) : roles,
                System.currentTimeMillis());
        return getById(userId);
    }

    public AuthUser setEnabled(long userId, boolean enabled) {
        repository.updateEnabled(userId, enabled, System.currentTimeMillis());
        return getById(userId);
    }

    public void resetPassword(long userId, String newPassword) {
        repository.updatePassword(userId, passwordHasher.hash(newPassword), System.currentTimeMillis());
    }

    public void delete(long userId) {
        repository.deleteById(userId);
    }

    /**
     * 首启动种子：用户表为空且配置了 bootstrap-admin-username 时建一个 ADMIN。
     * 密码留空则随机生成并打印一次（仅此处可见，请尽快登录改密）。
     */
    public void bootstrapAdminIfEmpty() {
        String username = props.getBootstrapAdminUsername();
        if (username == null || username.isBlank() || repository.count() > 0) {
            return;
        }
        String password = props.getBootstrapAdminPassword();
        boolean generated = password == null || password.isBlank();
        if (generated) {
            password = UUID.randomUUID().toString().replace("-", "");
        }
        create(username, password, List.of("ADMIN", "USER"), null);
        if (generated) {
            log.warn("已创建种子管理员 [{}]，随机初始密码：{}  （仅打印一次，请尽快登录修改）", username, password);
        } else {
            log.info("已创建种子管理员 [{}]（密码取自配置）", username);
        }
    }
}
