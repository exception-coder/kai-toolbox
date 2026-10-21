package com.exceptioncoder.toolbox.foreconsult.suggestion;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.TimeUnit;

/** 概率模型只返回文本补丁；宿主在独立工作树中执行固定、可验证的文件与提交动作。 */
@Component
public class ConsultSuggestionPatch {
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(ConsultSuggestionPatch.class);
    static final String PREFIX = "frontend/src/features/fore-consult/components/";
    public static final List<String> FILES = List.of(PREFIX + "ImageLightbox.tsx", PREFIX + "ConsultMessageActions.tsx",
            PREFIX + "ConsultConversationRuntimeStatus.tsx", PREFIX + "ConsultUpgradeNotice.tsx");
    private final ConsultSuggestionModel model;
    private final ConsultSuggestionReview review;
    private final Path root;
    private final Path workspaceBase;
    private final com.exceptioncoder.toolbox.common.project.ProjectAccess access;

    @org.springframework.beans.factory.annotation.Autowired
    public ConsultSuggestionPatch(ConsultSuggestionModel model, ConsultSuggestionReview review,
            @Value("${toolbox.consult.suggestion-development.project-root:}") String projectRoot,
            com.exceptioncoder.toolbox.common.project.ProjectAccess access) {
        this(model, review, projectRoot, Path.of(System.getProperty("user.home"), ".kai-toolbox", "consult-development"), access);
    }

    ConsultSuggestionPatch(ConsultSuggestionModel model, ConsultSuggestionReview review, String projectRoot, Path workspaceBase) {
        this(model, review, projectRoot, workspaceBase, null);
    }

    private ConsultSuggestionPatch(ConsultSuggestionModel model, ConsultSuggestionReview review, String projectRoot, Path workspaceBase,
            com.exceptioncoder.toolbox.common.project.ProjectAccess access) {
        this.model = model; this.review = review;
        this.root = Path.of(projectRoot.isBlank() ? System.getProperty("user.dir") : projectRoot).toAbsolutePath().normalize();
        this.workspaceBase = workspaceBase.toAbsolutePath().normalize();
        this.access = access;
    }

    public record Result(String commit, String reason) { }

    public Result develop(ConsultSuggestion suggestion) throws Exception {
        if (access != null) access.requireAllowed(root);
        if (!Files.isDirectory(root.resolve("tools/tool-fore-consult"))) throw new IllegalStateException("咨询源码工作区未就绪");
        String name = command(root, "git", "config", "user.name").strip();
        String email = command(root, "git", "config", "user.email").strip();
        if (name.isBlank() || email.isBlank()) throw new IllegalStateException("未配置真实 Git 作者");
        String id = UUID.fromString(suggestion.id()).toString();
        Path workspace = workspaceBase.resolve(id);
        Files.createDirectories(workspace.getParent());
        // 同一任务只创建一次；中断保留工作树，不 reset/remove 他人的产物。
        command(root, "git", "worktree", "add", "-b", "consult-suggestion/" + id, workspace.toString(), "HEAD");
        Path frontend = workspace.resolve("frontend");
        Path dependencies = root.resolve("frontend/node_modules").toRealPath();
        if (System.getProperty("os.name").startsWith("Windows")) {
            command(frontend, "cmd.exe", "/c", "mklink", "/J", frontend.resolve("node_modules").toString(), dependencies.toString());
        } else Files.createSymbolicLink(frontend.resolve("node_modules"), dependencies);
        String skill = new ClassPathResource("fore-consult-skills/consult-suggestion-development/SKILL.md")
                .getContentAsString(StandardCharsets.UTF_8);
        Map<String, String> baseline = new LinkedHashMap<>();
        for (String file : FILES) {
            if (!workspace.resolve(file).toRealPath().startsWith(workspace.toRealPath())) throw new IllegalStateException("源码文件超出工作区");
            baseline.put(file, Files.readString(workspace.resolve(file), StandardCharsets.UTF_8));
        }
        String failure = "";
        Exception lastFailure = null;
        for (int attempt = 0; attempt < 3; attempt++) {
            // 修正只重建本任务的四个展示文件；不是 git reset，不改变其他对象。
            for (var entry : baseline.entrySet()) Files.writeString(workspace.resolve(entry.getKey()), entry.getValue(), StandardCharsets.UTF_8);
            JsonNode patch = model.ask(skill, Map.of("suggestion", suggestion, "files", baseline, "previousFailure", failure));
            if ("MANUAL".equals(patch.path("outcome").asText())) return new Result(null, "自动实现范围不足，已转入人工排队");
            Set<String> changed = apply(workspace, baseline, patch);
            boolean committing = false;
            try {
                var guard = new ArrayList<>(List.of("node", root.resolve("frontend/scripts/check-consult-suggestion-patch.mjs").toString()));
                for (String file : changed) guard.add(file.substring("frontend/".length()));
                command(frontend, guard.toArray(String[]::new));
                review.reviewPatch(suggestion, command(workspace, "git", "diff", "--", PREFIX));
                command(frontend, "node", "node_modules/typescript/bin/tsc", "-b", "--noEmit");
                command(frontend, "node", "scripts/check-feature-boundaries.mjs");
                command(frontend, "node", "node_modules/vitest/vitest.mjs", "run", "src/features/fore-consult/components");
                Path qualityJar = root.resolve("forge-quality/forge-quality-cli/target/forge-quality-cli.jar");
                if (!Files.isRegularFile(qualityJar)) throw new IllegalStateException("项目质量门禁制品未就绪，请维护人员先构建门禁");
                String quality = command(workspace, "java", "-jar", qualityJar.toString(), "verify", "static", "--project", workspace.toString(), "--format", "json");
                if (!"PASSED".equals(new com.fasterxml.jackson.databind.ObjectMapper().readTree(quality).path("status").asText())) throw new IllegalStateException("项目质量门禁未通过");
                var add = new ArrayList<>(List.of("git", "add", "--")); add.addAll(changed);
                committing = true;
                command(workspace, add.toArray(String[]::new));
                String message = "fix(consult): " + suggestion.title().replace('\n', ' ').replace('\r', ' ')
                        + "\n\n【改动】按已审核咨询建议优化展示。\n【原因】" + suggestion.problem()
                        + "\n【结果】展示范围检查、类型检查、边界检查及咨询组件测试通过；独立分支待合并，未发布。\n建议编号：" + id;
                Path body = workspace.getParent().resolve(id + "-commit.txt");
                Files.writeString(body, message, StandardCharsets.UTF_8);
                command(workspace, "git", "commit", "-F", body.toString());
                String commit = command(workspace, "git", "rev-parse", "HEAD").strip();
                if (!commit.matches("[a-f0-9]{40}")) throw new IllegalStateException("无法核对提交结果");
                Set<String> committedPaths = new LinkedHashSet<>(command(workspace, "git", "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD").lines().toList());
                if (!committedPaths.equals(changed) || !command(workspace, "git", "diff", "--name-only").isBlank()) throw new IllegalStateException("提交范围或工作区状态需人工核对");
                return new Result(commit, "已在独立分支提交，等待合并与运行验收；未发布");
            } catch (Exception error) {
                // 提交阶段不重跑，避免未知提交结果产生第二次提交；验证失败才带回给模型修正。
                if (error instanceof InterruptedException) Thread.currentThread().interrupt();
                if (Thread.currentThread().isInterrupted()) throw error;
                if (committing) throw error;
                LOG.warn("咨询补丁验证未通过 suggestion={} attempt={}", id, attempt + 1, error);
                lastFailure = error;
                failure = error.getMessage();
                if (failure == null) failure = "验证失败";
                if (failure.length() > 8000) failure = failure.substring(failure.length() - 8000);
            }
        }
        throw new IllegalStateException("三次实现仍未通过验证，保留工作区等待人工接续", lastFailure);
    }

    static Set<String> apply(Path workspace, Map<String, String> baseline, JsonNode patch) throws Exception {
        JsonNode edits = patch.path("edits");
        if (!"PATCH".equals(patch.path("outcome").asText()) || !edits.isArray() || edits.isEmpty() || edits.size() > 6) throw new IllegalArgumentException("补丁格式无效");
        Map<String, String> content = new LinkedHashMap<>();
        int total = 0;
        for (JsonNode edit : edits) {
            for (String key : List.of("path", "before", "after")) if (!edit.path(key).isTextual()) throw new IllegalArgumentException("补丁字段无效");
            String file = edit.path("path").asText();
            if (!FILES.contains(file) || !baseline.containsKey(file)) throw new IllegalArgumentException("补丁超出咨询展示范围");
            Path target = workspace.resolve(file).normalize();
            if (!target.startsWith(workspace) || Files.isSymbolicLink(target) || !target.toRealPath().startsWith(workspace.toRealPath())) throw new IllegalArgumentException("补丁路径无效");
            String before = edit.path("before").asText(), after = edit.path("after").asText();
            total += before.length() + after.length();
            if (before.isBlank() || before.equals(after) || total > 12000) throw new IllegalArgumentException("补丁无变化或过大");
            String current = content.getOrDefault(file, baseline.get(file));
            int start = current.indexOf(before);
            if (start < 0 || current.indexOf(before, start + before.length()) >= 0) throw new IllegalArgumentException("补丁原文不是唯一匹配");
            content.put(file, current.substring(0, start) + after + current.substring(start + before.length()));
        }
        if (content.size() > 3) throw new IllegalArgumentException("补丁文件过多");
        for (var entry : content.entrySet()) Files.writeString(workspace.resolve(entry.getKey()), entry.getValue(), StandardCharsets.UTF_8);
        return content.keySet();
    }

    private static String command(Path cwd, String... args) throws Exception {
        Path log = Files.createTempFile("consult-development-", ".log");
        Process process = null;
        try {
            process = new ProcessBuilder(args).directory(cwd.toFile()).redirectErrorStream(true).redirectOutput(log.toFile()).start();
            if (!process.waitFor(Duration.ofMinutes(3).toMillis(), TimeUnit.MILLISECONDS)) throw new IllegalStateException("固定验证命令超时");
            if (Files.size(log) > 1_000_000) throw new IllegalStateException("命令输出过大，需人工核对完整日志");
            String output = new String(Files.readAllBytes(log), StandardCharsets.UTF_8);
            if (process.exitValue() != 0) throw new IllegalStateException(output);
            return output;
        } finally {
            if (process != null && process.isAlive()) {
                process.descendants().forEach(ProcessHandle::destroy);
                process.destroy();
            }
            Files.deleteIfExists(log);
        }
    }
}
