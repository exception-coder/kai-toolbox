package com.exceptioncoder.toolbox.claudechat.service.delegation;

import com.exceptioncoder.toolbox.claudechat.config.SessionClientProperties;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionClientErrorCode;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionGrantException;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

/** 校验独立于 Forge 用户登录态的业务服务端 Relay 身份。 */
@Service
public class SessionRelayClientAuthenticator {

    private static final String BASIC_PREFIX = "Basic ";
    private final SessionClientProperties properties;

    public SessionRelayClientAuthenticator(SessionClientProperties properties) {
        this.properties = properties;
    }

    /** 校验 HTTP Basic 服务凭据并返回已认证 client id。 */
    public String authenticate(String authorization) {
        SessionClientProperties.Relay relay = properties.getRelay();
        if (!relay.isEnabled() || relay.getClientId().isBlank() || relay.getClientSecret().isBlank()) {
            throw denied();
        }
        String supplied = decode(authorization);
        String expected = relay.getClientId() + ":" + relay.getClientSecret();
        if (!MessageDigest.isEqual(supplied.getBytes(StandardCharsets.UTF_8),
                expected.getBytes(StandardCharsets.UTF_8))) {
            throw denied();
        }
        return relay.getClientId();
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
