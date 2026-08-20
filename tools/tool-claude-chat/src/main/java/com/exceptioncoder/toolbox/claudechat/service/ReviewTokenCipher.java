package com.exceptioncoder.toolbox.claudechat.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Optional;

/** 评审令牌的可恢复存储边界；密文仅用于已登录的内部会话展示原链接。 */
@Component
public class ReviewTokenCipher {
    private static final String VERSION = "v1";
    private static final int NONCE_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public ReviewTokenCipher(@Value("${toolbox.auth.secret:kai-toolbox-local-default-secret-change-me-32B}") String secret) {
        try {
            byte[] derived = MessageDigest.getInstance("SHA-256")
                    .digest(("kai-toolbox:review-token:v1:" + secret).getBytes(StandardCharsets.UTF_8));
            this.key = new SecretKeySpec(derived, "AES");
        } catch (Exception e) {
            throw new IllegalStateException("无法初始化评审令牌加密", e);
        }
    }

    public String encrypt(String token) {
        try {
            byte[] nonce = new byte[NONCE_BYTES];
            random.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, nonce));
            byte[] encrypted = cipher.doFinal(token.getBytes(StandardCharsets.UTF_8));
            Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
            return VERSION + "." + encoder.encodeToString(nonce) + "." + encoder.encodeToString(encrypted);
        } catch (Exception e) {
            throw new IllegalStateException("无法保存评审链接", e);
        }
    }

    public Optional<String> decrypt(String encoded) {
        if (encoded == null || encoded.isBlank()) return Optional.empty();
        try {
            String[] parts = encoded.split("\\.", -1);
            if (parts.length != 3 || !VERSION.equals(parts[0])) return Optional.empty();
            Base64.Decoder decoder = Base64.getUrlDecoder();
            byte[] nonce = decoder.decode(parts[1]);
            if (nonce.length != NONCE_BYTES) return Optional.empty();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, nonce));
            return Optional.of(new String(cipher.doFinal(decoder.decode(parts[2])), StandardCharsets.UTF_8));
        } catch (Exception ignored) {
            return Optional.empty();
        }
    }
}
