package com.exceptioncoder.toolbox.claudechat.service.delegation;

import com.exceptioncoder.toolbox.claudechat.config.SessionRelayProperties;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionClientErrorCode;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionGrantException;
import org.springframework.stereotype.Service;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.cloud.context.environment.EnvironmentChangeEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.ConfigurableEnvironment;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

/** 校验独立于 Forge 用户登录态的业务服务端 Relay 身份。 */
@Service
public class SessionRelayClientAuthenticator {

    private static final String BASIC_PREFIX = "Basic ";
    private final ConfigurableEnvironment environment;
    private volatile SessionRelayProperties snapshot;

    public SessionRelayClientAuthenticator(ConfigurableEnvironment environment) {
        this.environment = environment;
        refresh();
    }

    /** 只响应 Relay 配置变化，完整重建以避免已删除属性残留。 */
    @EventListener
    public void onConfigurationChanged(EnvironmentChangeEvent event) {
        if (event.getKeys().stream().anyMatch(key -> key.equals(SessionRelayProperties.PREFIX)
                || key.startsWith(SessionRelayProperties.PREFIX + "."))) {
            refresh();
        }
    }

    private void refresh() {
        SessionRelayProperties candidate = Binder.get(environment)
                .bind(SessionRelayProperties.PREFIX, Bindable.of(SessionRelayProperties.class))
                .orElseGet(SessionRelayProperties::new);
        candidate.validateConfiguration();
        snapshot = candidate;
    }

    /** 校验 HTTP Basic 服务凭据并返回已认证 client id。 */
    public String authenticate(String authorization) {
        SessionRelayProperties relay = snapshot;
        if (!relay.isEnabled()) {
            throw denied();
        }
        String supplied = decode(authorization);
        if (relay.isManaged()) {
            for (SessionRelayProperties.Client client : relay.getClients()) {
                if (client.isEnabled() && matches(supplied, client.getClientId(), client.getClientSecret())) {
                    return client.getClientId();
                }
            }
            throw denied();
        }
        if (relay.getClientId().isBlank() || relay.getClientSecret().isBlank()
                || !matches(supplied, relay.getClientId(), relay.getClientSecret())) {
            throw denied();
        }
        return relay.getClientId();
    }

    private static boolean matches(String supplied, String clientId, String clientSecret) {
        String expected = clientId + ":" + clientSecret;
        return MessageDigest.isEqual(supplied.getBytes(StandardCharsets.UTF_8),
                expected.getBytes(StandardCharsets.UTF_8));
    }

    private static String decode(String authorization) {
        if (authorization == null || !authorization.startsWith(BASIC_PREFIX)) {
            return "";
        }
        try {
            return new String(Base64.getDecoder().decode(
                    authorization.substring(BASIC_PREFIX.length()).trim()), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException error) {
            return "";
        }
    }

    private static SessionGrantException denied() {
        return new SessionGrantException(SessionClientErrorCode.AUTHENTICATION_REQUIRED,
                "Relay 身份无效或入口未启用");
    }
}
