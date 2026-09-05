package com.exceptioncoder.toolbox.claudechat.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.concurrent.TimeUnit;

/** 为自动监督执行一次与当前工作区绑定的 Forge Quality Gate。 */
@Component
public class ForgeQualityGateAdapter {

    private static final boolean WINDOWS = System.getProperty("os.name", "").toLowerCase().contains("win");
    private static final long TIMEOUT_MINUTES = 20L;
    private static final int MAX_OUTPUT = 4_000;

    private final ObjectMapper objectMapper;

    public ForgeQualityGateAdapter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public Result verify(Path projectRoot, String repositoryIdentity) {
        Path verificationRoot = resolveVerificationRoot(projectRoot, repositoryIdentity);
        if (verificationRoot == null) {
            return new Result(Status.UNAVAILABLE, null, "项目没有 Forge Quality Gate 入口");
        }
        Path script = verificationRoot.resolve("scripts/forge-quality.ps1").normalize();
        String fingerprint = workspaceFingerprint(verificationRoot);
        Path output = null;
        try {
            output = Files.createTempFile("kai-autopilot-quality-", ".log");
            List<String> command = WINDOWS
                    ? List.of("pwsh.exe", "-NoLogo", "-NoProfile", "-File", script.toString(),
                    "verify", "-Phase", "all", "-Project", verificationRoot.toString(), "-Format", "json")
                    : List.of("pwsh", "-NoLogo", "-NoProfile", "-File", script.toString(),
                    "verify", "-Phase", "all", "-Project", verificationRoot.toString(), "-Format", "json");
            Process process = new ProcessBuilder(command).directory(verificationRoot.toFile())
                    .redirectErrorStream(true).redirectOutput(output.toFile()).start();
            if (!process.waitFor(TIMEOUT_MINUTES, TimeUnit.MINUTES)) {
                process.destroyForcibly();
                process.waitFor(5, TimeUnit.SECONDS);
                return new Result(Status.FAILED, fingerprint, "Forge Quality Gate 执行超时");
            }
            String text = Files.readString(output, StandardCharsets.UTF_8).trim();
            if (process.exitValue() != 0) {
                return new Result(Status.FAILED, fingerprint, bounded(text));
            }
            JsonNode root = objectMapper.readTree(text);
            String status = root.path("status").asText("");
            if (!"PASSED".equalsIgnoreCase(status) && !"SUCCESS".equalsIgnoreCase(status)) {
                return new Result(Status.FAILED, fingerprint,
                        "Forge Quality Gate 未返回通过状态：" + bounded(text));
            }
            return new Result(Status.PASSED, fingerprint, bounded(text));
        } catch (IOException exception) {
            return new Result(Status.UNAVAILABLE, fingerprint, "Forge Quality Gate 无法启动");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return new Result(Status.FAILED, fingerprint, "Forge Quality Gate 被中断");
        } finally {
            if (output != null) {
                try {
                    Files.deleteIfExists(output);
                } catch (IOException ignored) {
                    // 临时输出清理失败不改变验证结果。
                }
            }
        }
    }

    Path resolveVerificationRoot(Path projectRoot, String repositoryIdentity) {
        Path normalizedProjectRoot = projectRoot.toAbsolutePath().normalize();
        if (hasQualityGate(normalizedProjectRoot)) {
            return normalizedProjectRoot;
        }
        if (repositoryIdentity == null || repositoryIdentity.isBlank()) {
            return null;
        }
        Path repositoryRoot;
        try {
            repositoryRoot = Path.of(repositoryIdentity).toAbsolutePath().normalize();
        } catch (RuntimeException exception) {
            return null;
        }
        if (!normalizedProjectRoot.startsWith(repositoryRoot) || !hasQualityGate(repositoryRoot)) {
            return null;
        }
        return repositoryRoot;
    }

    private boolean hasQualityGate(Path directory) {
        return Files.isRegularFile(directory.resolve("scripts/forge-quality.ps1").normalize());
    }

    private String workspaceFingerprint(Path projectRoot) {
        return sha256(command(projectRoot, List.of("git", "rev-parse", "HEAD")) + "\n"
                + command(projectRoot, List.of("git", "status", "--porcelain=v1", "--untracked-files=normal")));
    }

    private String command(Path directory, List<String> command) {
        try {
            Process process = new ProcessBuilder(command).directory(directory.toFile())
                    .redirectErrorStream(true).start();
            byte[] output = process.getInputStream().readNBytes(64_000);
            if (!process.waitFor(20, TimeUnit.SECONDS) || process.exitValue() != 0) {
                process.destroyForcibly();
                return "";
            }
            return new String(output, StandardCharsets.UTF_8).trim();
        } catch (IOException exception) {
            return "";
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return "";
        }
    }

    private String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("运行环境不支持 SHA-256", exception);
        }
    }

    private String bounded(String value) {
        if (value == null || value.isBlank()) {
            return "没有可用的质量门禁诊断";
        }
        String sanitized = value.replaceAll("(?i)(token|password|secret)\\s*[:=]\\s*[^,\\s}]+",
                "$1=[REDACTED]");
        return sanitized.length() <= MAX_OUTPUT ? sanitized : sanitized.substring(sanitized.length() - MAX_OUTPUT);
    }

    public enum Status { PASSED, FAILED, UNAVAILABLE }

    public record Result(Status status, String workspaceFingerprint, String detail) {
    }
}
