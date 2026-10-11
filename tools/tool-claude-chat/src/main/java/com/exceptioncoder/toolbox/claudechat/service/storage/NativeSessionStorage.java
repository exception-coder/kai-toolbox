package com.exceptioncoder.toolbox.claudechat.service.storage;

import com.exceptioncoder.toolbox.claudechat.api.dto.SessionStorageView.EngineStorage;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 已验证引擎布局的只读适配；共享存储不估算单会话物理占用。 */
final class NativeSessionStorage {
    private static final String SAFE_ID = "[a-zA-Z0-9_-]{1,100}";
    private final Path userHome;
    private final String copilotHome;
    private final SessionRecordFiles records = new SessionRecordFiles();

    NativeSessionStorage(Path userHome) {
        this.userHome = userHome.toAbsolutePath().normalize();
        String configured = System.getenv("COPILOT_HOME");
        this.copilotHome = configured == null || configured.isBlank() ? this.userHome.resolve(".copilot").toString() : configured;
    }

    NativeSessionStorage(Path userHome, Path copilotHome) {
        this.userHome = userHome.toAbsolutePath().normalize();
        this.copilotHome = copilotHome.toAbsolutePath().normalize().toString();
    }

    Measurement measure(String engine, String handle, String cwd, String codexHome) {
        if ("unknown".equals(engine)) {
            return unavailable(engine, "unavailable", "历史引擎记录映射不完整");
        }
        if (!java.util.Set.of("claude", "codex", "pi", "copilot", "antigravity").contains(engine)) {
            return unavailable(engine, "unsupported", "该引擎尚未提供可精确归属的文件大小");
        }
        if (handle == null || handle.isBlank()) {
            return unavailable(engine, "pending", "尚未保存原生记录句柄");
        }
        try {
            return switch (engine) {
                case "claude" -> claude(handle, cwd);
                case "codex" -> codex(handle, codexHome);
                case "pi" -> pi(handle);
                case "copilot" -> copilot(handle);
                case "antigravity" -> antigravity(handle);
                default -> unavailable(engine, "unsupported", "该引擎尚未提供可精确归属的文件大小");
            };
        } catch (IOException | SecurityException | InvalidPathException exception) {
            return unavailable(engine, "unavailable", "记录路径无效、不可访问或超出引擎存储根");
        }
    }

    private Measurement claude(String id, String cwd) throws IOException {
        if (!id.matches(SAFE_ID)) {
            return unavailable("claude", "unavailable", "原生记录身份无效");
        }
        Path root = userHome.resolve(".claude/projects");
        var scan = records.cached(root, 2);
        String target = cwd == null || cwd.isBlank() ? null : cwd.replaceAll("[^a-zA-Z0-9]", "-");
        List<Path> candidates = scan.files().stream()
                .filter(file -> file.getFileName().toString().equals(id + ".jsonl"))
                .filter(file -> !file.getParent().getFileName().toString().equals("_trash"))
                .filter(file -> matchesClaudeProject(file.getParent().getFileName().toString(), target))
                .toList();
        List<Path> primary = candidates.stream()
                .filter(file -> !file.getParent().getFileName().toString().startsWith("_backup_"))
                .toList();
        List<Path> chosen = primary.isEmpty() ? candidates : primary;
        if (chosen.size() > 1) {
            return unavailable("claude", "unavailable", "原生记录路径不唯一");
        }
        if (chosen.isEmpty()) {
            return missing("claude", scan.complete());
        }
        Path main = chosen.getFirst();
        var agents = records.scan(main.getParent().resolve(id).resolve("subagents"), 6);
        List<Path> files = new ArrayList<>(List.of(main));
        files.addAll(agents.files().stream().filter(file -> file.toString().endsWith(".jsonl")).toList());
        return sum("claude", root, files, scan.complete() && agents.complete(), "主记录与该会话的子 Agent 记录");
    }

    private static boolean matchesClaudeProject(String name, String target) {
        if (target == null) {
            return true;
        }
        String project = name.startsWith("_backup_") ? name.substring(8) : name;
        project = project.endsWith("_cwdfix") ? project.substring(0, project.length() - 7) : project;
        return project.equalsIgnoreCase(target);
    }

    private Measurement codex(String id, String codexHome) throws IOException {
        if (!id.matches(SAFE_ID)) {
            return unavailable("codex", "unavailable", "原生记录身份无效");
        }
        Path root = codexHome == null || codexHome.isBlank()
                ? userHome.resolve(".codex") : Path.of(codexHome.trim()).toAbsolutePath().normalize();
        var sessions = records.cached(root.resolve("sessions"), 4);
        var archived = records.cached(root.resolve("archived_sessions"), 4);
        List<Path> files = new ArrayList<>(sessions.files());
        files.addAll(archived.files());
        List<Path> matched = files.stream().filter(file -> {
            String name = file.getFileName().toString();
            return name.startsWith("rollout-") && name.endsWith("-" + id + ".jsonl");
        }).toList();
        boolean complete = sessions.complete() && archived.complete();
        return matched.isEmpty() ? missing("codex", complete)
                : sum("codex", root, matched, complete, "绑定授权目录内的原生 rollout 记录");
    }

    private Measurement pi(String handle) throws IOException {
        Path root = userHome.resolve(".pi/agent/sessions");
        Path file = Path.of(handle).toAbsolutePath().normalize();
        if (!file.startsWith(root) || !file.toString().endsWith(".jsonl")) {
            return unavailable("pi", "unavailable", "原生记录不在已适配的 Pi 会话目录");
        }
        return sum("pi", root, List.of(file), true, "绑定的原生会话 JSONL");
    }

    private Measurement copilot(String id) throws IOException {
        if (!id.matches(SAFE_ID)) {
            return unavailable("copilot", "unavailable", "原生记录身份无效");
        }
        Path root = Path.of(copilotHome).toAbsolutePath().normalize().resolve("session-state");
        Path directory = root.resolve(id);
        if (!Files.exists(directory)) {
            return missing("copilot", true);
        }
        if (!directory.toRealPath().equals(root.toRealPath().resolve(id))) {
            return unavailable("copilot", "unavailable", "会话目录通过链接越界");
        }
        var scan = records.scan(directory, 8);
        return sum("copilot", root, scan.files(), scan.complete(), "独立会话目录，含事件、计划与检查点");
    }

    private Measurement antigravity(String id) throws IOException {
        if (!id.matches(SAFE_ID)) {
            return unavailable("antigravity", "unavailable", "原生记录身份无效");
        }
        Path root = userHome.resolve(".gemini/antigravity-cli/brain");
        Path file = root.resolve(id).resolve(".system_generated/logs/transcript.jsonl");
        return sum("antigravity", root, List.of(file), true, "原生 transcript 记录");
    }

    private Measurement sum(String engine, Path root, List<Path> candidates, boolean complete, String description) {
        Map<Path, Long> files = new LinkedHashMap<>();
        boolean missing = false;
        for (Path candidate : candidates) {
            try {
                Path real = SessionRecordFiles.contained(root, candidate);
                files.put(real, Files.size(real));
            } catch (java.nio.file.NoSuchFileException exception) {
                missing = true;
                complete = false;
            } catch (IOException | SecurityException exception) {
                complete = false;
            }
        }
        String status = complete ? "available" : !files.isEmpty() ? "partial" : missing ? "missing" : "unavailable";
        Long bytes = files.isEmpty() && !complete ? null : files.values().stream().mapToLong(Long::longValue).sum();
        EngineStorage view = new EngineStorage(engine, status, bytes, files.size(),
                complete ? description : description + "；部分路径缺失、不可访问或扫描不完整");
        return new Measurement(view, Map.copyOf(files));
    }

    private static Measurement missing(String engine, boolean complete) {
        return unavailable(engine, complete ? "missing" : "unavailable",
                complete ? "未找到绑定的原生记录" : "文件定位失败或扫描达到上限");
    }

    static Measurement unavailable(String engine, String status, String description) {
        return new Measurement(new EngineStorage(engine, status, null, 0, description), Map.of());
    }

    record Measurement(EngineStorage view, Map<Path, Long> files) { }
}
