package com.exceptioncoder.toolbox.claudechat.service.governance;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** 项目编码门禁的单一持久配置；独立于可能阻塞的 execution 存储锁。 */
public final class ProjectExecutionControlStore {
    private static final ObjectMapper JSON = new ObjectMapper();
    private ProjectExecutionControlStore() { }

    public static boolean disabled(Path project) {
        return Files.exists(project.resolve(".forge/execution-control.json")) && !read(project).enabled();
    }

    public record Event(int revision, boolean enabled, String changedAt, String actor, String reason) { }
    public record Control(int schemaVersion, String project, boolean enabled, int revision,
                          String changedAt, String actor, String reason, List<Event> history) { }

    public static Control read(Path project) {
        try {
            Path root = project.toRealPath();
            Path file = controlFile(root);
            if (!Files.exists(file)) {
                return new Control(1, root.toString(), true, 0, null, null, null, List.of());
            }
            if (Files.size(file) > 4 * 1024 * 1024) {
                throw new IllegalStateException("编码门禁配置过大，请核对审计记录");
            }
            var tree = JSON.readTree(file.toFile());
            if (!tree.path("enabled").isBoolean() || !tree.path("revision").isInt()) {
                throw new IllegalStateException("项目编码门禁配置缺少有效开关或版本");
            }
            Control value = JSON.treeToValue(tree, Control.class);
            if (value.schemaVersion() != 1 || !root.toString().equals(value.project())
                    || value.revision() < 0 || value.history() == null) {
                throw new IllegalStateException("项目编码门禁配置无效，请核对控制记录");
            }
            return value;
        } catch (IOException exception) {
            throw new UncheckedIOException("读取项目编码门禁失败", exception);
        }
    }

    /** 同项目跨会话共享版本；原 execution、验证和工作文件均不修改。 */
    public static synchronized Control update(Path project, int expectedRevision, boolean enabled,
                                              String actor, String reason) {
        Control before = read(project);
        if (before.revision() != expectedRevision) {
            throw new RevisionConflictException();
        }
        if (before.enabled() == enabled) {
            return before;
        }
        if (actor == null || actor.isBlank() || reason == null || reason.isBlank() || reason.length() > 1000) {
            throw new IllegalArgumentException("门禁变更需要操作者和不超过1000字的原因");
        }
        String now = Instant.now().toString();
        var events = new ArrayList<>(before.history());
        events.add(new Event(before.revision() + 1, enabled, now, actor, reason));
        Control next = new Control(1, before.project(), enabled, before.revision() + 1,
                now, actor, reason, List.copyOf(events));
        Path file = controlFile(Path.of(before.project()));
        Path temporary = file.resolveSibling("execution-control." + UUID.randomUUID() + ".tmp");
        try {
            Files.createDirectories(file.getParent());
            byte[] bytes = JSON.writeValueAsBytes(next);
            if (bytes.length > 4 * 1024 * 1024) {
                throw new IllegalStateException("门禁审计超过上限，请先归档记录");
            }
            Files.write(temporary, bytes);
            try {
                Files.move(temporary, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (AtomicMoveNotSupportedException exception) {
                throw new IllegalStateException("项目文件系统不支持原子保存门禁配置", exception);
            }
            return next;
        } catch (IOException exception) {
            throw new UncheckedIOException("保存编码门禁失败；请重新读取实际状态后再试", exception);
        } finally {
            try {
                Files.deleteIfExists(temporary);
            } catch (IOException ignored) {
                // A temporary-file cleanup failure must not conceal the atomic-save result.
            }
        }
    }

    private static Path controlFile(Path root) {
        Path directory = root.resolve(".forge");
        Path file = directory.resolve("execution-control.json");
        if (Files.isSymbolicLink(directory) || Files.isSymbolicLink(file)) {
            throw new IllegalArgumentException("编码门禁配置不能使用符号链接");
        }
        return file;
    }

    public static final class RevisionConflictException extends RuntimeException {
        public RevisionConflictException() { super("门禁状态已被其他会话修改，请刷新后再操作"); }
    }
}
