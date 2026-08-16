package com.exceptioncoder.toolbox.claudechat.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;

/**
 * 读取固定团队依赖仓库的远端版本快照，不修改工作树或 origin。
 */
@Service("claudeChatTeamDependencyVersionService")
public class TeamDependencyVersionService {

    private static final long FETCH_TIMEOUT_MS = 20_000L;
    private static final long READ_TIMEOUT_MS = 5_000L;
    private static final int MAX_ERROR_LENGTH = 240;
    private static final List<String> PLUGIN_MANIFESTS = List.of(
            ".claude-plugin/marketplace.json",
            ".agents/plugins/marketplace.json");

    private final ObjectMapper mapper;

    public TeamDependencyVersionService(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    /** 读取插件仓库的远端 manifest 版本与提交快照。 */
    public RemoteVersionSnapshot readPlugin(Path repository, String repositoryName, String pluginName,
                                            String remoteUrl, String source, boolean fetch) {
        return read(repository, repositoryName, pluginName, remoteUrl, source, fetch);
    }

    /** 读取 MCP 知识库仓库的远端提交快照。 */
    public RemoteVersionSnapshot readMcp(Path repository, String repositoryName,
                                         String remoteUrl, String source, boolean fetch) {
        return read(repository, repositoryName, null, remoteUrl, source, fetch);
    }

    private RemoteVersionSnapshot read(Path repository, String repositoryName, String pluginName,
                                       String remoteUrl, String source, boolean fetch) {
        if (!fetch) {
            return RemoteVersionSnapshot.notChecked();
        }
        if (!Files.isDirectory(repository.resolve(".git"))) {
            return RemoteVersionSnapshot.error("团队依赖仓库未拉取");
        }

        String reference = "refs/remotes/forge-version/" + source + "/" + repositoryName;
        CommandResult fetched = runGit(repository, FETCH_TIMEOUT_MS,
                "fetch", "--quiet", remoteUrl, "HEAD:" + reference);
        if (!fetched.success()) {
            return RemoteVersionSnapshot.error("远端拉取失败：" + compact(fetched.output()));
        }

        String commit = output(repository, "rev-parse", "--short", reference);
        String commitDate = output(repository, "log", "-1", "--format=%cs", reference);
        Integer behind = integerOutput(repository, "rev-list", "--count", "HEAD.." + reference);
        if (commit == null) {
            return RemoteVersionSnapshot.error("远端提交无法读取");
        }

        if (pluginName == null) {
            return RemoteVersionSnapshot.checked(null, commit, commitDate, behind);
        }
        if (pluginName.isBlank()) {
            return RemoteVersionSnapshot.error("不支持的团队依赖类型");
        }

        try {
            String version = readRemotePluginVersion(repository, reference, pluginName);
            return RemoteVersionSnapshot.checked(version, commit, commitDate, behind);
        } catch (IllegalStateException exception) {
            return new RemoteVersionSnapshot(null, commit, commitDate, behind, true, exception.getMessage());
        }
    }

    private String readRemotePluginVersion(Path repository, String reference, String pluginName) {
        Set<String> versions = new LinkedHashSet<>();
        for (String manifest : PLUGIN_MANIFESTS) {
            CommandResult result = runGit(repository, READ_TIMEOUT_MS, "show", reference + ":" + manifest);
            if (!result.success() || result.output().isBlank()) {
                continue;
            }
            String version = parsePluginVersion(result.output(), pluginName);
            if (version != null) {
                versions.add(version);
            }
        }
        if (versions.isEmpty()) {
            throw new IllegalStateException("远端 manifest 未声明插件版本");
        }
        if (versions.size() > 1) {
            throw new IllegalStateException("Claude 与 Codex manifest 版本不一致：" + String.join(" / ", versions));
        }
        return versions.iterator().next();
    }

    String parsePluginVersion(String content, String pluginName) {
        try {
            JsonNode plugins = mapper.readTree(content).path("plugins");
            if (!plugins.isArray()) {
                return null;
            }
            for (JsonNode plugin : plugins) {
                if (pluginName.equals(plugin.path("name").asText(null))) {
                    String version = plugin.path("version").asText(null);
                    return version == null || version.isBlank() ? null : version;
                }
            }
            return null;
        } catch (Exception exception) {
            throw new IllegalStateException("远端 manifest 解析失败", exception);
        }
    }

    private String output(Path repository, String... arguments) {
        CommandResult result = runGit(repository, READ_TIMEOUT_MS, arguments);
        return result.success() && !result.output().isBlank() ? result.output().trim() : null;
    }

    private Integer integerOutput(Path repository, String... arguments) {
        String value = output(repository, arguments);
        try {
            return value == null ? null : Integer.valueOf(value);
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private CommandResult runGit(Path repository, long timeoutMs, String... arguments) {
        List<String> command = new ArrayList<>(arguments.length + 1);
        command.add("git");
        command.addAll(List.of(arguments));
        Process process = null;
        try {
            ProcessBuilder builder = new ProcessBuilder(command)
                    .directory(repository.toFile())
                    .redirectErrorStream(true);
            builder.environment().put("GIT_TERMINAL_PROMPT", "0");
            builder.environment().put("GCM_INTERACTIVE", "Never");
            process = builder.start();
            Process started = process;
            FutureTask<String> outputTask = new FutureTask<>(() -> {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                        started.getInputStream(), StandardCharsets.UTF_8))) {
                    StringBuilder output = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        if (output.length() > 0) {
                            output.append(System.lineSeparator());
                        }
                        output.append(line);
                    }
                    return output.toString();
                }
            });
            Thread.ofVirtual().name("team-dependency-git-output").start(outputTask);
            if (!process.waitFor(timeoutMs, TimeUnit.MILLISECONDS)) {
                process.destroyForcibly();
                return new CommandResult(-1, "执行超时");
            }
            return new CommandResult(process.exitValue(), outputTask.get(2, TimeUnit.SECONDS));
        } catch (Exception exception) {
            if (process != null) {
                process.destroyForcibly();
            }
            return new CommandResult(-1, exception.getMessage() == null ? "执行失败" : exception.getMessage());
        }
    }

    private static String compact(String output) {
        if (output == null || output.isBlank()) {
            return "无输出";
        }
        String compact = output.replaceAll("\\s+", " ").trim();
        return compact.length() <= MAX_ERROR_LENGTH
                ? compact
                : compact.substring(0, MAX_ERROR_LENGTH) + "...";
    }

    /**
     * 团队依赖单仓远端版本快照。
     *
     * @param version 插件 manifest 版本，MCP 为 null
     * @param commit 远端短提交号
     * @param commitDate 远端提交日期
     * @param behind 本地 HEAD 落后远端的提交数
     * @param checked 是否已经发起本次远端检查
     * @param error 单仓检测失败原因
     */
    public record RemoteVersionSnapshot(String version, String commit, String commitDate, Integer behind,
                                        boolean checked, String error) {

        /** 返回未触发远端检测的快照。 */
        public static RemoteVersionSnapshot notChecked() {
            return new RemoteVersionSnapshot(null, null, null, null, false, null);
        }

        /** 返回已成功检测的快照。 */
        public static RemoteVersionSnapshot checked(String version, String commit, String commitDate, Integer behind) {
            return new RemoteVersionSnapshot(version, commit, commitDate, behind, true, null);
        }

        /** 返回单仓检测失败的快照。 */
        public static RemoteVersionSnapshot error(String message) {
            return new RemoteVersionSnapshot(null, null, null, null, true, message);
        }
    }

    private record CommandResult(int exitCode, String output) {
        private boolean success() {
            return exitCode == 0;
        }
    }
}
