package com.exceptioncoder.toolbox.foreconsult.service;

import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/** 仅由服务端传入 MCP 进程的会话签名，不进入工具参数或模型提示词。 */
@Component
public class ConsultResourceAccess {
    private final byte[] key = new byte[32];
    public ConsultResourceAccess() { new SecureRandom().nextBytes(key); }

    public String issue(String runtimeId) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(runtimeId.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException exception) {
            throw new IllegalStateException("无法签发咨询资源会话", exception);
        }
    }
    public void require(String runtimeId, String token) {
        if (token == null || !MessageDigest.isEqual(issue(runtimeId).getBytes(StandardCharsets.UTF_8), token.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "咨询资源会话签名无效");
        }
    }
}
