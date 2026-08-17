package com.regentech_fashion.supplierquote.infrastructure.erp;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/** 兼容 SCM 历史 MD5 密码格式，仅用于验证既有 ERP 账号。 */
final class LegacyScmPasswordVerifier {
    private static final String ALGORITHM = "MD5";

    /** 校验明文密码是否匹配历史密码摘要。 */
    boolean matches(String rawPassword, String username, String encodedPassword) {
        if (rawPassword == null || username == null || encodedPassword == null) {
            return false;
        }
        String saltedPassword = rawPassword + "{" + username + "}";
        String actual = HexFormat.of().formatHex(digest(saltedPassword));
        return MessageDigest.isEqual(actual.getBytes(StandardCharsets.US_ASCII),
                encodedPassword.getBytes(StandardCharsets.US_ASCII));
    }

    private static byte[] digest(String value) {
        try {
            return MessageDigest.getInstance(ALGORITHM).digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("JVM does not provide MD5 required by legacy SCM passwords", exception);
        }
    }
}
