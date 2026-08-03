package com.exceptioncoder.toolbox.prdclarify.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;

/**
 * 工时评估证据指纹。PRD/TDD 使用文件内容哈希；代码只核对 Agent 实际检查过的关键文件，
 * 避免需求列表每次刷新都遍历整个大型仓库。
 */
public final class EstimationEvidenceFingerprint {

    private EstimationEvidenceFingerprint() {
    }

    public static String text(String value) {
        return sha256((value == null ? "" : value).getBytes(StandardCharsets.UTF_8));
    }

    /** 文件不存在按空内容处理，因此“评估时无 TDD、之后生成 TDD”也能被识别为变化。 */
    public static String fileOrEmpty(String path) {
        if (path == null || path.isBlank()) return text("");
        try {
            Path file = Path.of(path).toAbsolutePath().normalize();
            return Files.isRegularFile(file) ? sha256(Files.readAllBytes(file)) : text("");
        } catch (Exception e) {
            return "unreadable";
        }
    }

    /**
     * 对 Agent 声明实际检查过的文件做稳定指纹。LLM 返回的路径不可信，必须限制在项目根目录内。
     */
    public static String inspectedFiles(String projectPath, List<String> inspectedFiles) {
        if (projectPath == null || projectPath.isBlank() || inspectedFiles == null || inspectedFiles.isEmpty()) {
            return "";
        }
        Path root;
        try {
            root = Path.of(projectPath).toAbsolutePath().normalize();
        } catch (Exception e) {
            return "unreadable";
        }
        MessageDigest digest = digest();
        inspectedFiles.stream()
                .filter(value -> value != null && !value.isBlank())
                .map(String::trim)
                .distinct()
                .sorted()
                .limit(12)
                .forEach(value -> updateFile(digest, root, value));
        return HexFormat.of().formatHex(digest.digest());
    }

    private static void updateFile(MessageDigest digest, Path root, String value) {
        digest.update(value.getBytes(StandardCharsets.UTF_8));
        digest.update((byte) 0);
        try {
            Path supplied = Path.of(value);
            Path file = (supplied.isAbsolute() ? supplied : root.resolve(supplied)).toAbsolutePath().normalize();
            if (!file.startsWith(root) || !Files.isRegularFile(file)) {
                digest.update("missing-or-outside".getBytes(StandardCharsets.UTF_8));
                return;
            }
            digest.update(Files.readAllBytes(file));
        } catch (IOException | RuntimeException e) {
            digest.update("unreadable".getBytes(StandardCharsets.UTF_8));
        }
    }

    private static String sha256(byte[] bytes) {
        return HexFormat.of().formatHex(digest().digest(bytes));
    }

    private static MessageDigest digest() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("JVM 不支持 SHA-256", e);
        }
    }
}
