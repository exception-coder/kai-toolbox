package com.exceptioncoder.toolbox.claudechat.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.io.IOException;
import java.nio.file.Files;

/** 将 OpenSpec CLI 的 status/apply/validate/archive 输出转换为稳定的监督协议。 */
@Service
public class OpenSpecAutopilotAdapter {

    private static final String SAFE_CHANGE_ID = "[A-Za-z0-9][A-Za-z0-9._-]{0,119}";

    private final OpenSpecCliGateway cliGateway;
    private final ObjectMapper objectMapper;

    public OpenSpecAutopilotAdapter(OpenSpecCliGateway cliGateway, ObjectMapper objectMapper) {
        this.cliGateway = cliGateway;
        this.objectMapper = objectMapper;
    }

    public List<ChangeOption> listChanges(Path projectRoot) {
        JsonNode root = requireJson(projectRoot, List.of("list", "--json"), "读取 OpenSpec changes");
        List<ChangeOption> changes = new ArrayList<>();
        root.path("changes").forEach(node -> changes.add(new ChangeOption(
                node.path("name").asText(), node.path("completedTasks").asInt(0),
                node.path("totalTasks").asInt(0), node.path("lastModified").asText(null))));
        return List.copyOf(changes);
    }

    public ChangeSnapshot inspect(Path projectRoot, String changeId) {
        requireChangeId(changeId);
        JsonNode status = requireJson(projectRoot,
                List.of("status", "--change", changeId, "--json"), "读取 OpenSpec 状态");
        JsonNode apply = requireJson(projectRoot,
                List.of("instructions", "apply", "--change", changeId, "--json"), "读取 OpenSpec tasks");
        List<TaskSnapshot> tasks = parseTasks(apply.path("tasks"));
        int completed = apply.path("progress").path("complete").asInt(
                (int) tasks.stream().filter(TaskSnapshot::done).count());
        int total = apply.path("progress").path("total").asInt(tasks.size());
        Map<String, List<String>> artifactPaths = artifactPaths(projectRoot, status);
        String revision = sha256(status.toString() + "\n" + apply.toString());
        return new ChangeSnapshot(changeId, revision, completed, total, tasks, artifactPaths,
                tasks.stream().filter(task -> !task.done()).findFirst().orElse(null));
    }

    public ValidationResult strictValidate(Path projectRoot, String changeId) {
        requireChangeId(changeId);
        OpenSpecCliGateway.CommandResult result = cliGateway.run(projectRoot,
                List.of("validate", changeId, "--strict", "--json", "--no-interactive"));
        return validationResult(result, "OpenSpec strict validation");
    }

    public ValidationResult archive(Path projectRoot, String changeId) {
        requireChangeId(changeId);
        OpenSpecCliGateway.CommandResult result = cliGateway.run(projectRoot,
                List.of("archive", changeId, "--yes", "--json"));
        return validationResult(result, "OpenSpec archive");
    }

    /** 仅用于归档成功后、数据库提交前进程中断的恢复确认。 */
    public boolean isArchived(Path projectRoot, String repositoryIdentity, String changeId) {
        requireChangeId(changeId);
        Path archiveRoot = resolveArchiveRoot(projectRoot, repositoryIdentity);
        if (archiveRoot == null) {
            return false;
        }
        try (var entries = Files.list(archiveRoot)) {
            return entries.filter(Files::isDirectory)
                    .map(path -> path.getFileName().toString())
                    .anyMatch(name -> name.equals(changeId) || name.endsWith("-" + changeId));
        } catch (IOException exception) {
            return false;
        }
    }

    Path resolveArchiveRoot(Path projectRoot, String repositoryIdentity) {
        Path normalizedProjectRoot = projectRoot.toAbsolutePath().normalize();
        Path localArchiveRoot = archiveRoot(normalizedProjectRoot);
        if (Files.isDirectory(localArchiveRoot)) {
            return localArchiveRoot;
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
        Path repositoryArchiveRoot = archiveRoot(repositoryRoot);
        if (!normalizedProjectRoot.startsWith(repositoryRoot) || !Files.isDirectory(repositoryArchiveRoot)) {
            return null;
        }
        return repositoryArchiveRoot;
    }

    private Path archiveRoot(Path directory) {
        return directory.resolve("openspec/changes/archive").normalize();
    }

    private List<TaskSnapshot> parseTasks(JsonNode nodes) {
        List<TaskSnapshot> tasks = new ArrayList<>();
        int ordinal = 0;
        for (JsonNode node : nodes) {
            ordinal++;
            int applyOrdinal = parseOrdinal(node.path("id").asText(), ordinal);
            String description = node.path("description").asText("").trim();
            String humanId = outlineId(description).orElse(Integer.toString(applyOrdinal));
            String text = description.startsWith(humanId + " ")
                    ? description.substring(humanId.length() + 1).trim() : description;
            tasks.add(new TaskSnapshot(humanId, applyOrdinal, text, node.path("done").asBoolean(false)));
        }
        return List.copyOf(tasks);
    }

    private Map<String, List<String>> artifactPaths(Path projectRoot, JsonNode status) {
        Map<String, List<String>> paths = new LinkedHashMap<>();
        status.path("artifactPaths").fields().forEachRemaining(entry -> {
            List<String> existing = new ArrayList<>();
            entry.getValue().path("existingOutputPaths").forEach(path -> {
                try {
                    Path root = projectRoot.toAbsolutePath().normalize();
                    Path reported = Path.of(path.asText());
                    Path absolute = (reported.isAbsolute() ? reported : root.resolve(reported)).normalize();
                    if (!absolute.startsWith(root)) {
                        return;
                    }
                    existing.add(root.relativize(absolute)
                            .toString().replace('\\', '/'));
                } catch (RuntimeException ignored) {
                    // 不向前端泄露无法确认属于项目的绝对路径。
                }
            });
            paths.put(entry.getKey(), List.copyOf(existing));
        });
        return Map.copyOf(paths);
    }

    private JsonNode requireJson(Path projectRoot, List<String> arguments, String operation) {
        OpenSpecCliGateway.CommandResult result = cliGateway.run(projectRoot, arguments);
        if (!result.started()) {
            throw new IllegalStateException(operation + "失败：OpenSpec CLI 不可用");
        }
        if (result.timedOut()) {
            throw new IllegalStateException(operation + "超时");
        }
        if (result.exitCode() != 0) {
            throw new IllegalStateException(operation + "失败");
        }
        try {
            return objectMapper.readTree(result.output());
        } catch (Exception exception) {
            throw new IllegalStateException(operation + "返回了无法识别的数据", exception);
        }
    }

    private ValidationResult validationResult(OpenSpecCliGateway.CommandResult result, String operation) {
        if (!result.started()) {
            return new ValidationResult(false, operation + " 无法启动：OpenSpec CLI 不可用");
        }
        if (result.timedOut()) {
            return new ValidationResult(false, operation + " 超时");
        }
        if (result.exitCode() != 0) {
            return new ValidationResult(false, bounded(result.output()));
        }
        return new ValidationResult(true, bounded(result.output()));
    }

    private void requireChangeId(String changeId) {
        if (changeId == null || !changeId.matches(SAFE_CHANGE_ID)) {
            throw new IllegalArgumentException("OpenSpec change 标识不合法");
        }
    }

    private Optional<String> outlineId(String description) {
        int separator = description.indexOf(' ');
        String candidate = separator < 0 ? description : description.substring(0, separator);
        return candidate.matches("\\d+(?:\\.\\d+)+") ? Optional.of(candidate) : Optional.empty();
    }

    private int parseOrdinal(String value, int fallback) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException exception) {
            return fallback;
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

    private String bounded(String value) {
        if (value == null) {
            return "";
        }
        String sanitized = value.replaceAll("(?i)(token|password|secret)\\s*[:=]\\s*[^,\\s}]+", "$1=[REDACTED]");
        return sanitized.length() <= 2_000 ? sanitized : sanitized.substring(sanitized.length() - 2_000);
    }

    public record ChangeOption(String id, int completedTasks, int totalTasks, String lastModified) {
    }

    public record TaskSnapshot(String id, int applyOrdinal, String description, boolean done) {
    }

    public record ChangeSnapshot(String changeId, String revision, int completedTasks, int totalTasks,
                                 List<TaskSnapshot> tasks, Map<String, List<String>> artifactPaths,
                                 TaskSnapshot nextTask) {
    }

    public record ValidationResult(boolean passed, String detail) {
    }
}
