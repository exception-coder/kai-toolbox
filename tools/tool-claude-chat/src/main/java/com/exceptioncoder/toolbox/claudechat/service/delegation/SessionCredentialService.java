package com.exceptioncoder.toolbox.claudechat.service.delegation;

import com.exceptioncoder.toolbox.common.auth.config.AuthProperties;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/** 生成会话邀请/连接票据并只持久化带服务端密钥的 HMAC 摘要。 */
@Service
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class SessionCredentialService {

    private static final String HMAC_ALGORITHM = "HmacSHA256";
    private static final int TOKEN_BYTES = 32;

    private final SecureRandom secureRandom = new SecureRandom();
    private final byte[] hashingKey;

    public SessionCredentialService(AuthProperties properties) {
        this.hashingKey = (properties.getSecret() + ":session-client-credential:v1")
                .getBytes(StandardCharsets.UTF_8);
    }

    /**
     * 生成高熵 URL-safe 凭证。
     *
     * @return 只应返回给调用方一次的原始值
     */
    public String issueRawCredential() {
        byte[] bytes = new byte[TOKEN_BYTES];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /**
     * 计算用于持久化和查询的不可逆凭证摘要。
     *
     * @param rawCredential 原始凭证
     * @return 小写十六进制 HMAC-SHA256
     */
    public String hash(String rawCredential) {
        if (rawCredential == null || rawCredential.isBlank()) {
            throw new IllegalArgumentException("凭证不能为空");
        }
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(hashingKey, HMAC_ALGORITHM));
            return HexFormat.of().formatHex(mac.doFinal(rawCredential.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException("无法计算会话凭证摘要", error);
        }
    }
}
