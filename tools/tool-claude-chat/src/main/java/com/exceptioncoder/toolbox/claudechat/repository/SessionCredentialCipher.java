package com.exceptioncoder.toolbox.claudechat.repository;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * 会话级第三方网关密钥的落库加密边界（AES-GCM）。
 *
 * <p>密文以 {@code enc:v1.} 开头；无前缀的旧值视为历史明文原样读取，由启动迁移补加密。
 * 密钥由 {@code toolbox.auth.secret} 派生，与评审令牌使用不同派生上下文。</p>
 */
@Slf4j
@Component
public class SessionCredentialCipher {
    static final String PREFIX = "enc:v1.";
    private static final String DEFAULT_SECRET = "kai-toolbox-local-default-secret-change-me-32B";
    private static final int NONCE_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public SessionCredentialCipher(@Value("${toolbox.auth.secret:" + DEFAULT_SECRET + "}") String secret) {
        try {
            byte[] derived = MessageDigest.getInstance("SHA-256")
                    .digest(("kai-toolbox:session-credential:v1:" + secret).getBytes(StandardCharsets.UTF_8));
            this.key = new SecretKeySpec(derived, "AES");
        } catch (Exception e) {
            throw new IllegalStateException("无法初始化会话凭据加密", e);
        }
    }

    /** 未注入配置的场景（如仓储单测）使用与默认配置一致的派生密钥。 */
    static SessionCredentialCipher withDefaultSecret() {
        return new SessionCredentialCipher(DEFAULT_SECRET);
    }

    public boolean isEncrypted(String value) {
        return value != null && value.startsWith(PREFIX);
    }

    /** 空值不加密；已是密文的值不重复加密。 */
    public String encrypt(String plain) {
        if (plain == null || plain.isEmpty() || isEncrypted(plain)) return plain;
        try {
            byte[] nonce = new byte[NONCE_BYTES];
            random.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, nonce));
            byte[] encrypted = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
            return PREFIX + encoder.encodeToString(nonce) + "." + encoder.encodeToString(encrypted);
        } catch (Exception e) {
            throw new IllegalStateException("无法加密会话凭据", e);
        }
    }

    /** 历史明文原样返回；密文无法解开（例如更换了 secret）时返回 null，会话按未配置凭据处理。 */
    public String decrypt(String stored) {
        if (stored == null || !isEncrypted(stored)) return stored;
        try {
            String[] parts = stored.substring(PREFIX.length()).split("\\.", -1);
            if (parts.length != 2) throw new IllegalArgumentException("密文格式无效");
            Base64.Decoder decoder = Base64.getUrlDecoder();
            byte[] nonce = decoder.decode(parts[0]);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, nonce));
            return new String(cipher.doFinal(decoder.decode(parts[1])), StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.warn("[claude-chat] 会话网关凭据无法解密，按未配置处理：{}", e.getMessage());
            return null;
        }
    }
}
