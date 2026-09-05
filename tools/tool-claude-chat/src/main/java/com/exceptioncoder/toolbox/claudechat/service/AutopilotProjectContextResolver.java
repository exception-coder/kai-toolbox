package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.concurrent.TimeUnit;

/** 解析会话允许的项目目录，并生成绑定运行所需的 Git/工作区身份。 */
@Service
public class AutopilotProjectContextResolver {

    private static final int MAX_COMMAND_OUTPUT = 12_000;
    private final ClaudeChatSessionRepository sessionRepository;

    public AutopilotProjectContextResolver(ClaudeChatSessionRepository sessionRepository) {
        this.sessionRepository = sessionRepository;
    }

    public ProjectIdentity resolve(String sessionId, String requestedPath) {
        ClaudeChatSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在：" + sessionId));
        Path sessionRoot = Path.of(session.getCwd()).toAbsolutePath().normalize();
        Path projectRoot = requestedPath == null || requestedPath.isBlank()
                ? sessionRoot : Path.of(requestedPath).toAbsolutePath().normalize();
        if (!Files.isDirectory(projectRoot) || !projectRoot.equals(sessionRoot)) {
            throw new IllegalArgumentException("自动监督项目必须与当前会话工作目录一致");
        }
        String repositoryIdentity = command(projectRoot, List.of("git", "rev-parse", "--show-toplevel"));
        String branch = command(projectRoot, List.of("git", "branch", "--show-current"));
        String status = command(projectRoot, List.of("git", "status", "--porcelain=v1", "--untracked-files=normal"));
        String fingerprint = sha256(repositoryIdentity + "\n" + branch + "\n" + status);
        return new ProjectIdentity(projectRoot, repositoryIdentity, branch, fingerprint, session.getSdkSessionId());
    }

    private String command(Path directory, List<String> command) {
        Path output = null;
        try {
            output = Files.createTempFile("kai-autopilot-git-", ".log");
            Process process = new ProcessBuilder(command)
                    .directory(directory.toFile())
                    .redirectErrorStream(true)
                    .redirectOutput(output.toFile())
                    .start();
            if (!process.waitFor(20, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                return "";
            }
            String text = Files.readString(output, StandardCharsets.UTF_8).trim();
            if (process.exitValue() != 0) {
                return "";
            }
            return text.length() <= MAX_COMMAND_OUTPUT ? text : text.substring(text.length() - MAX_COMMAND_OUTPUT);
        } catch (IOException exception) {
            return "";
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return "";
        } finally {
            if (output != null) {
                try {
                    Files.deleteIfExists(output);
                } catch (IOException ignored) {
                    // 临时诊断文件清理失败不改变项目身份判定。
                }
            }
        }
    }

    private String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("运行环境不支持 SHA-256", exception);
        }
    }

    public record ProjectIdentity(Path projectRoot, String repositoryIdentity, String branch,
                                  String workspaceFingerprint, String agentSessionRef) {
    }
}
