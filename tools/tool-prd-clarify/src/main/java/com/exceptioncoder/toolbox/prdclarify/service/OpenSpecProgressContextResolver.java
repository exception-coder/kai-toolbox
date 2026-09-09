package com.exceptioncoder.toolbox.prdclarify.service;

import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 只接受显式 change 标识的 OpenSpec 任务上下文解析器。 */
@Component
public class OpenSpecProgressContextResolver {

    private static final Pattern CHANGE_BINDING = Pattern.compile(
            "(?im)(?:openspec(?:\\s+change)?|变更)\\s*[:：=]\\s*([a-z0-9][a-z0-9-]{1,100})");

    public Context resolve(String projectPath, String extraContext) {
        Matcher matcher = CHANGE_BINDING.matcher(extraContext == null ? "" : extraContext);
        if (!matcher.find()) {
            return Context.unbound("未显式绑定 OpenSpec change；本次只能生成非权威源码核查结果");
        }
        String changeId = matcher.group(1);
        Path root = Path.of(projectPath).toAbsolutePath().normalize();
        Path changeRoot = root.resolve("openspec").resolve("changes").resolve(changeId).normalize();
        if (!changeRoot.startsWith(root) || !Files.isDirectory(changeRoot)) {
            return Context.unbound("显式绑定的 OpenSpec change 不存在: " + changeId);
        }
        Path tasks = changeRoot.resolve("tasks.md");
        if (!Files.isRegularFile(tasks)) {
            return Context.unbound("OpenSpec change 缺少 tasks.md: " + changeId);
        }
        try {
            return new Context(true, changeId, Files.readString(tasks, StandardCharsets.UTF_8),
                    "OpenSpec tasks 是本次完成度的权威计划边界");
        } catch (Exception exception) {
            return Context.unbound("无法读取 OpenSpec tasks: " + exception.getMessage());
        }
    }

    public record Context(boolean authoritative, String changeId, String tasks, String note) {
        static Context unbound(String note) {
            return new Context(false, null, "", note);
        }
    }
}
