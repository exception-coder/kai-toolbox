package com.exceptioncoder.toolbox.reqpool.service;

import com.exceptioncoder.toolbox.reqpool.domain.ReqItem;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;

/** 为需求事实和组合成员生成确定性 SHA-256 指纹。 */
@Component
public class ReqInsightFingerprint {

    public String sourceHash(ReqItem item) {
        MessageDigest digest = sha256();
        append(digest, item.getTitle());
        append(digest, item.getDescription());
        append(digest, item.getProject());
        append(digest, item.getModule());
        return HexFormat.of().formatHex(digest.digest());
    }

    public String portfolioSetHash(List<ReqItem> items) {
        MessageDigest digest = sha256();
        items.stream()
                .sorted(Comparator.comparing(ReqItem::getId))
                .forEach(item -> {
                    append(digest, item.getId());
                    append(digest, sourceHash(item));
                });
        return HexFormat.of().formatHex(digest.digest());
    }

    private static void append(MessageDigest digest, String value) {
        String normalized = value == null ? "" : value.strip().replace("\r\n", "\n");
        byte[] bytes = normalized.getBytes(StandardCharsets.UTF_8);
        digest.update(Integer.toString(bytes.length).getBytes(StandardCharsets.US_ASCII));
        digest.update((byte) ':');
        digest.update(bytes);
        digest.update((byte) '\n');
    }

    private static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("JVM 不支持 SHA-256", exception);
        }
    }
}
