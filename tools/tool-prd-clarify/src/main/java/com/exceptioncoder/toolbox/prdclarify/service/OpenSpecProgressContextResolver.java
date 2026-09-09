package com.exceptioncoder.toolbox.prdclarify.service;

import org.springframework.stereotype.Component;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 从已解析的需求项目中发现并读取 OpenSpec 任务计划。 */
@Component
public class OpenSpecProgressContextResolver {
    private static final String CHANGE_ID = "[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}";
    private static final Pattern CHANGE_BINDING = Pattern.compile(
            "(?im)(?:openspec(?:\\s+change)?|变更)\\s*[:：=]\\s*(" + CHANGE_ID + ")\\s*$");
    private static final Pattern BINDING_HEADER = Pattern.compile("(?im)(?:openspec(?:\\s+change)?|变更)\\s*[:：=]");
    private static final int MAX_ENTRIES = 500;
    private static final int MAX_TASK_BYTES = 256 * 1024;

    /** 只扫描标准目录的一层；归档、无任务文件的目录不参与候选。 */
    public Discovery discover(String projectPath) {
        try {
            Path root = Path.of(projectPath).toRealPath();
            Path changes = root.resolve("openspec/changes");
            if (Files.notExists(changes)) {
                return new Discovery("EMPTY", List.of(), null, "项目尚无 openspec/changes，可先核查源码");
            }
            if (!changes.toRealPath().startsWith(root)) {
                throw new IOException("OpenSpec 目录超出项目范围");
            }
            List<Path> entries;
            try (var paths = Files.list(changes)) {
                entries = paths.limit(MAX_ENTRIES + 1L).toList();
            }
            if (entries.size() > MAX_ENTRIES) {
                throw new IOException("OpenSpec 目录超过 500 项，请先整理归档");
            }
            List<String> candidates = new ArrayList<>();
            for (Path entry : entries) {
                String id = entry.getFileName().toString();
                if ("archive".equalsIgnoreCase(id) || !id.matches(CHANGE_ID) || !Files.isDirectory(entry)) {
                    continue;
                }
                if (!Files.notExists(entry.resolve("tasks.md"))) {
                    readTasks(root, id);
                    candidates.add(id);
                }
            }
            candidates.sort(String::compareTo);
            String selected = candidates.size() == 1 ? candidates.getFirst() : null;
            return new Discovery(candidates.isEmpty() ? "EMPTY" : "READY", List.copyOf(candidates), selected,
                    candidates.isEmpty() ? "未发现含 tasks.md 的活动变更，可先核查源码"
                            : selected != null ? "已自动关联项目中唯一的活动变更" : "发现多个活动变更，请选择本次需求对应的计划");
        } catch (IOException | IllegalArgumentException exception) {
            return new Discovery("ERROR", List.of(), null, "读取项目 OpenSpec 失败：" + exception.getMessage());
        }
    }

    public Context resolve(String projectPath, String extraContext) {
        Matcher matcher = CHANGE_BINDING.matcher(extraContext == null ? "" : extraContext);
        String changeId;
        if (matcher.find()) {
            changeId = matcher.group(1);
        } else {
            if (extraContext != null && BINDING_HEADER.matcher(extraContext).find()) {
                throw new IllegalArgumentException("OpenSpec 变更标识不合法，请重新选择");
            }
            Discovery discovery = discover(projectPath);
            if ("ERROR".equals(discovery.state())) {
                throw new IllegalStateException(discovery.message());
            }
            if (discovery.changeIds().size() > 1) {
                throw new IllegalStateException("项目有多个 OpenSpec 变更，请先选择对应计划后重新分析");
            }
            changeId = discovery.selectedChange();
            if (changeId == null) {
                return Context.unbound(discovery.message() + "；本次不是 OpenSpec 任务完成度核验");
            }
        }
        try {
            return new Context(true, changeId, readTasks(Path.of(projectPath).toRealPath(), changeId),
                    "OpenSpec tasks 是本次完成度的权威计划边界");
        } catch (IOException exception) {
            throw new IllegalStateException("关联的 OpenSpec 变更不可读，请刷新选择后重试：" + changeId, exception);
        }
    }

    private String readTasks(Path root, String changeId) throws IOException {
        if ("archive".equalsIgnoreCase(changeId)) {
            throw new IOException("不能使用归档目录作为活动变更");
        }
        Path changes = root.resolve("openspec/changes").toRealPath();
        Path change = changes.resolve(changeId).toRealPath();
        Path tasks = change.resolve("tasks.md").toRealPath();
        if (!changes.startsWith(root) || !change.getParent().equals(changes)
                || !tasks.getParent().equals(change) || !Files.isRegularFile(tasks)) {
            throw new IOException("任务文件超出项目变更目录");
        }
        try (var input = Files.newInputStream(tasks)) {
            byte[] bytes = input.readNBytes(MAX_TASK_BYTES + 1);
            if (bytes.length > MAX_TASK_BYTES) {
                throw new IOException("tasks.md 超过 256 KiB 上限");
            }
            String content = new String(bytes, StandardCharsets.UTF_8);
            if (content.isBlank()) {
                throw new IOException("tasks.md 为空");
            }
            return content;
        }
    }

    public record Discovery(String state, List<String> changeIds, String selectedChange, String message) { }

    public record Context(boolean authoritative, String changeId, String tasks, String note) {
        static Context unbound(String note) {
            return new Context(false, null, "", note);
        }
    }
}
