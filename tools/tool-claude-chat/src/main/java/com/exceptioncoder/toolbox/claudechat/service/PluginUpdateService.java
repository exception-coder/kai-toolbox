package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.PluginStatusView;
import com.exceptioncoder.toolbox.claudechat.api.dto.PluginStatusView.EngineStatus;
import com.exceptioncoder.toolbox.claudechat.api.dto.SuiteStatusView;
import com.exceptioncoder.toolbox.claudechat.api.dto.TeamDependencyEnvironmentView;
import com.exceptioncoder.toolbox.claudechat.api.dto.TeamDependencyEnvironmentView.ToolView;
import com.exceptioncoder.toolbox.claudechat.api.dto.TeamRepositoryStatusView;
import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
import com.exceptioncoder.toolbox.claudechat.config.PluginUpdateProperties;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * team-standards 插件双端版本检测 + 一键更新。
 *
 * <p>确定性按钮场景:跑配置化的固定命令(非 MCP/AI 流)。进程执行遵循铁律——
 * {@code ProcessBuilder} + 合并 stderr + 行级 drain + {@code waitFor} 超时 + {@code destroyForcibly}。
 * 更新过程经 {@link SseEmitterRegistry} 实时回显。
 */
@Slf4j
@Service
public class PluginUpdateService {

    private static final boolean WINDOWS =
            System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
    private static final Pattern SEMVER = Pattern.compile("(\\d+\\.\\d+\\.\\d+)");

    private final PluginUpdateProperties props;
    private final ClaudeChatProperties chatProps;
    private final ClaudeChatSessionRepository sessionRepository;
    private final SseEmitterRegistry sse;
    private final ObjectMapper mapper;
    private final SidecarProcessRegistry sidecarRegistry;

    private static final List<String> DEPENDENCY_REPOS = List.of(
            "cross-project-topology", "project-coding-profiles", "project-domain-knowledge",
            "team-standards", "yoooni-daily-plugin");
    private static final long MAX_NEW_FILE_BYTES = 2L * 1024 * 1024;
    private static final List<String> APPROVED_NEW_ROOTS = List.of(
            ".agents", ".claude", ".claude-plugin", ".codex-plugin", "docs", "hooks", "knowledge",
            "plugins", "profiles", "references", "rules", "scripts", "skills", "src", "templates",
            "test", "tests");
    private static final List<String> APPROVED_ROOT_FILES = List.of(
            ".gitattributes", ".gitignore", ".mcp.json.example", "AGENTS.md", "CLAUDE.md", "LICENSE",
            "README.md", "package-lock.json", "package.json", "pom.xml", "tsconfig.json");
    private static final List<String> APPROVED_NEW_EXTENSIONS = List.of(
            "bat", "cjs", "cmd", "css", "gif", "html", "java", "jpeg", "jpg", "js", "json",
            "jsonc", "kt", "md", "mjs", "png", "properties", "ps1", "py", "scss", "sh", "sql",
            "svg", "toml", "ts", "tsx", "txt", "webp", "xml", "yaml", "yml");
    private static final String SYNC_STATE_FILE = ".forge-sync-state.json";
    private static final Map<String, String> GITEE_OWNERS = Map.ofEntries(
            Map.entry("cross-project-topology", "wyoooni"), Map.entry("project-coding-profiles", "wyoooni"),
            Map.entry("project-domain-knowledge", "wyoooni"), Map.entry("team-standards", "wyoooni"),
            Map.entry("yoooni-daily-plugin", "wyoooni"));
    private static final Map<String, String> GITHUB_OWNERS = Map.ofEntries(
            Map.entry("cross-project-topology", "exception-coder"), Map.entry("project-coding-profiles", "exception-coder"),
            Map.entry("project-domain-knowledge", "exception-coder"), Map.entry("team-standards", "exception-coder"),
            Map.entry("yoooni-daily-plugin", "exception-coder"));

    public PluginUpdateService(PluginUpdateProperties props, ClaudeChatProperties chatProps,
                               ClaudeChatSessionRepository sessionRepository,
                               SseEmitterRegistry sse, ObjectMapper mapper,
                               SidecarProcessRegistry sidecarRegistry) {
        this.props = props;
        this.chatProps = chatProps;
        this.sessionRepository = sessionRepository;
        this.sse = sse;
        this.mapper = mapper;
        this.sidecarRegistry = sidecarRegistry;
    }

    // ===== 版本检测 =====

    public TeamDependencyEnvironmentView readEnvironment(String sessionId) {
        boolean mac = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("mac");
        String os = WINDOWS ? "windows" : mac ? "macos" : "other";
        ToolView git = tool("git", "Git", List.of("git", "--version"), null,
                WINDOWS ? "winget install --id Git.Git -e --source winget" : "xcode-select --install",
                WINDOWS ? "https://git-scm.com/install/windows" : "https://git-scm.com/install/mac");
        ToolView node = nodeTool();
        ToolView claude = tool("claude", "Claude Code", List.of(props.getClaudeBin(), "--version"), null,
                "npm install --global @anthropic-ai/claude-code",
                "https://docs.anthropic.com/en/docs/claude-code/getting-started");
        ToolView codex = tool("codex", "Codex", concat(codexParts(), "--version"), resolveCodexHome(sessionId),
                "npm install --global @openai/codex", "https://developers.openai.com/codex/cli/");
        List<ToolView> tools = List.of(git, node, claude, codex);
        return new TeamDependencyEnvironmentView(os, tools.stream().allMatch(ToolView::installed), tools);
    }

    private ToolView nodeTool() {
        CommandResult node = captureVersion(List.of("node", "--version"), null);
        CommandResult npm = captureVersion(List.of("npm", "--version"), null);
        boolean installed = node.exitCode == 0 && npm.exitCode == 0;
        String version = installed ? node.output.trim() + " · npm " + npm.output.trim()
                : node.exitCode == 0 ? node.output.trim() + "（npm 缺失）" : null;
        String command = WINDOWS ? "winget install OpenJS.NodeJS.LTS" : "brew install node";
        return new ToolView("node", "Node.js + npm", installed, version, command, "https://nodejs.org/en/download");
    }

    private ToolView tool(String id, String name, List<String> command, Path codexHome,
                          String installCommand, String officialUrl) {
        CommandResult result = captureVersion(command, codexHome);
        boolean installed = result.exitCode == 0;
        return new ToolView(id, name, installed, installed ? nullIfBlank(result.output.trim()) : null,
                installCommand, officialUrl);
    }

    private CommandResult captureVersion(List<String> command, Path codexHome) {
        try {
            return runCapture(command, codexHome);
        } catch (Exception e) {
            return new CommandResult(-1, "");
        }
    }

    public List<TeamRepositoryStatusView> readRepositoryStatuses(String requestedSource, boolean fetch) {
        String selectedSource = normalizeSource(requestedSource);
        Path workspace = dependencyWorkspace();
        JsonNode syncState = readSyncState(workspace);
        List<TeamRepositoryStatusView> statuses = new ArrayList<>();
        for (String name : DEPENDENCY_REPOS) {
            Path repo = workspace.resolve(name).toAbsolutePath().normalize();
            boolean cloned = Files.isDirectory(repo.resolve(".git"));
            if (!cloned) {
                statuses.add(new TeamRepositoryStatusView(name, false, null, false,
                        null, null, null, null, null, false, fetch));
                continue;
            }
            String remote = gitOutput(repo, 5_000, "remote", "get-url", "origin");
            String actualSource = remote.contains("github.com") ? "github" : remote.contains("gitee.com") ? "gitee" : "other";
            boolean matches = sameGitRemote(remote, repoUrl(name, selectedSource));
            boolean remoteChecked = false;
            if (fetch && matches) {
                remoteChecked = gitCapture(repo, 15_000, "fetch", "--quiet", "origin").exitCode == 0;
            }
            String commit = nullIfBlank(gitOutput(repo, 5_000, "rev-parse", "--short", "HEAD"));
            String commitDate = nullIfBlank(gitOutput(repo, 5_000, "log", "-1", "--format=%cs"));
            Integer behind = parseGitCount(gitOutput(repo, 5_000, "rev-list", "--count", "HEAD..@{u}"));
            Integer ahead = parseGitCount(gitOutput(repo, 5_000, "rev-list", "--count", "@{u}..HEAD"));
            boolean dirty = !gitOutput(repo, 5_000, "status", "--porcelain").isBlank();
            JsonNode state = syncState.path(name);
            Long lastSyncedAt = state.path("syncedAt").canConvertToLong() ? state.path("syncedAt").asLong() : null;
            if (lastSyncedAt == null) {
                try {
                    Path fetchHead = repo.resolve(".git/FETCH_HEAD");
                    if (Files.exists(fetchHead)) lastSyncedAt = Files.getLastModifiedTime(fetchHead).toMillis();
                } catch (IOException ignore) {
                    // 无法读取时间时保持未知
                }
            }
            statuses.add(new TeamRepositoryStatusView(name, true, actualSource, matches,
                    commit, commitDate, lastSyncedAt, behind, ahead, dirty, remoteChecked));
        }
        return statuses;
    }

    private static Integer parseGitCount(String value) {
        try {
            return value == null || value.isBlank() ? null : Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private JsonNode readSyncState(Path workspace) {
        try {
            Path file = workspace.resolve(SYNC_STATE_FILE);
            return Files.exists(file) ? mapper.readTree(file.toFile()) : mapper.createObjectNode();
        } catch (Exception e) {
            return mapper.createObjectNode();
        }
    }

    private synchronized void recordSuccessfulSync(Path workspace, String repo, String source) {
        try {
            Files.createDirectories(workspace);
            JsonNode current = readSyncState(workspace);
            ObjectNode root = current instanceof ObjectNode object ? object : mapper.createObjectNode();
            ObjectNode state = root.withObject("/" + repo);
            state.put("source", source);
            state.put("syncedAt", System.currentTimeMillis());
            mapper.writerWithDefaultPrettyPrinter().writeValue(workspace.resolve(SYNC_STATE_FILE).toFile(), root);
        } catch (Exception e) {
            log.warn("记录团队仓库同步时间失败: {}", e.getMessage());
        }
    }

    public PluginStatusView readStatus() {
        return new PluginStatusView(props.getMarketplace(), readClaudeStatus(), readCodexStatus());
    }

    private EngineStatus readClaudeStatus() {
        try {
            String selector = props.getPluginName() + "@" + props.getMarketplace();
            Path home = Path.of(System.getProperty("user.home"));
            // 已装版本:~/.claude/plugins/installed_plugins.json
            String installed = null;
            Path installedFile = home.resolve(".claude/plugins/installed_plugins.json");
            if (Files.exists(installedFile)) {
                JsonNode arr = mapper.readTree(installedFile.toFile()).path("plugins").path(selector);
                if (arr.isArray() && !arr.isEmpty()) installed = arr.get(0).path("version").asText(null);
            }
            // 市场可用版本:~/.claude/plugins/marketplaces/<mk>/.claude-plugin/marketplace.json
            String available = null;
            Path mkFile = home.resolve(".claude/plugins/marketplaces/" + props.getMarketplace()
                    + "/.claude-plugin/marketplace.json");
            if (Files.exists(mkFile)) {
                JsonNode plugins = mapper.readTree(mkFile.toFile()).path("plugins");
                if (plugins.isArray() && !plugins.isEmpty()) available = plugins.get(0).path("version").asText(null);
            }
            if (installed == null && available == null) {
                return EngineStatus.error("未找到 Claude 插件清单(~/.claude/plugins)");
            }
            return EngineStatus.of(installed, available);
        } catch (Exception e) {
            return EngineStatus.error("Claude 版本检测失败:" + e.getMessage());
        }
    }

    private EngineStatus readCodexStatus() {
        try {
            List<String> cmd = new ArrayList<>(codexParts());
            cmd.add("plugin");
            cmd.add("list");
            CommandResult r = runCapture(cmd);
            if (r.exitCode != 0 && r.output.isBlank()) {
                return EngineStatus.error("codex plugin list 执行失败(exit " + r.exitCode + ")");
            }
            String selector = props.getPluginName() + "@" + props.getMarketplace();
            for (String line : r.output.split("\\r?\\n")) {
                if (line.contains(selector)) {
                    Matcher m = SEMVER.matcher(line);
                    if (m.find()) return EngineStatus.of(m.group(1), null);
                    return EngineStatus.of("已装(版本未知)", null);
                }
            }
            return EngineStatus.of(null, null); // 未安装
        } catch (Exception e) {
            return EngineStatus.error("Codex 版本检测失败:" + e.getMessage());
        }
    }

    /**
     * 枚举 Claude Code 端**全部已安装插件**及其版本（当前会话实际加载的就是这些）。
     * 纯读 {@code ~/.claude/plugins/installed_plugins.json}（已装）+ 各市场
     * {@code marketplaces/<mk>/.claude-plugin/marketplace.json}（可用），不联网、不跑命令。
     * 文件缺失或解析失败时返回空列表（不抛错）。按插件名升序。
     */
    public List<SuiteStatusView> readSuites(String sessionId, boolean fetch) {
        Path home = Path.of(System.getProperty("user.home"));
        Map<String, String[]> installedPlugins = readInstalledPluginMap(home); // name -> [marketplace, version]
        Path codexHome = resolveCodexHome(sessionId);
        Map<String, String> codexInstalled = readCodexInstalled(codexHome);    // name -> codex 已装版本
        Map<String, Path> mcpRepos = readMcpServers(home);                     // name -> 知识库仓根（可能 null）
        List<SuiteStatusView> out = new ArrayList<>();
        for (String name : props.getWatchedPlugins()) {
            String[] info = installedPlugins.get(name);
            String marketplace = info != null ? info[0] : name; // 公司插件 marketplace 名 == 插件名
            String claudeVer = info != null ? info[1] : null;
            String codexVer = codexInstalled.get(name);
            String available = readMarketplaceVersion(home, marketplace, name);
            boolean present = claudeVer != null || codexVer != null;
            out.add(new SuiteStatusView(name, "plugin", marketplace, claudeVer, codexVer, available, present,
                    null, null, null));
        }
        for (String name : props.getWatchedMcps()) {
            boolean configured = mcpRepos.containsKey(name);
            Path repo = mcpRepos.get(name);
            String commit = null;
            String date = null;
            Integer behind = null;
            if (repo != null && Files.isDirectory(repo)) {
                if (fetch) {
                    gitOutput(repo, 25_000, "fetch", "--quiet"); // best-effort：刷新上游，使 behind 反映远端实情
                }
                commit = nullIfBlank(gitOutput(repo, 5_000, "rev-parse", "--short", "HEAD"));
                date = nullIfBlank(gitOutput(repo, 5_000, "log", "-1", "--format=%cs"));
                String b = gitOutput(repo, 5_000, "rev-list", "--count", "HEAD..@{u}");
                try {
                    if (!b.isBlank()) behind = Integer.parseInt(b.trim());
                } catch (NumberFormatException ignore) {
                    // 无上游 / 解析失败 → behind 保持 null（未知）
                }
            }
            out.add(new SuiteStatusView(name, "mcp", null, null, null, null, configured, commit, date, behind));
        }
        return out;
    }

    /** 跑一次 `codex plugin list`，解析出已安装插件 name -> 版本（"not installed" 跳过）。 */
    private Map<String, String> readCodexInstalled(Path codexHome) {
        Map<String, String> map = new HashMap<>();
        try {
            List<String> cmd = new ArrayList<>(codexParts());
            cmd.add("plugin");
            cmd.add("list");
            CommandResult r = runCapture(cmd, codexHome);
            for (String line : r.output.split("\\r?\\n")) {
                String t = line.trim();
                if (t.isEmpty() || !t.contains("installed") || t.contains("not installed")) {
                    continue;
                }
                String first = t.split("\\s+")[0];      // "<name>@<marketplace>"
                int at = first.indexOf('@');
                if (at <= 0) {
                    continue;
                }
                Matcher m = SEMVER.matcher(t);
                if (m.find()) {
                    map.put(first.substring(0, at), m.group(1));
                }
            }
        } catch (Exception e) {
            log.debug("codex plugin list 失败：{}", e.getMessage());
        }
        return map;
    }

    /** 读 ~/.claude/plugins/installed_plugins.json：插件名 -> [marketplace, 已装版本]。 */
    private Map<String, String[]> readInstalledPluginMap(Path home) {
        Map<String, String[]> map = new HashMap<>();
        try {
            Path f = home.resolve(".claude/plugins/installed_plugins.json");
            if (!Files.exists(f)) {
                return map;
            }
            JsonNode plugins = mapper.readTree(f.toFile()).path("plugins");
            if (!plugins.isObject()) {
                return map;
            }
            Iterator<Map.Entry<String, JsonNode>> it = plugins.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                String selector = e.getKey();              // "<name>@<marketplace>"
                int at = selector.lastIndexOf('@');         // 名字不含 @；按最后一个 @ 拆
                String name = at >= 0 ? selector.substring(0, at) : selector;
                String marketplace = at >= 0 ? selector.substring(at + 1) : "";
                JsonNode arr = e.getValue();
                String installed = arr.isArray() && !arr.isEmpty() ? arr.get(0).path("version").asText(null) : null;
                map.put(name, new String[]{marketplace, installed});
            }
        } catch (Exception ex) {
            log.debug("读取已安装插件清单失败：{}", ex.getMessage());
        }
        return map;
    }

    /**
     * 读 ~/.claude.json 顶层 mcpServers：server 名 -> 其知识库仓根（env.DOMAIN_KB_DIR 的父目录；
     * 无该 env 则 value 为 null）。key 存在即「已配置」。
     */
    private Map<String, Path> readMcpServers(Path home) {
        Map<String, Path> map = new HashMap<>();
        try {
            Path f = home.resolve(".claude.json");
            if (!Files.exists(f)) {
                return map;
            }
            JsonNode mcp = mapper.readTree(f.toFile()).path("mcpServers");
            if (!mcp.isObject()) {
                return map;
            }
            Iterator<Map.Entry<String, JsonNode>> it = mcp.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                JsonNode kb = e.getValue().path("env").path("DOMAIN_KB_DIR");
                Path repo = null;
                if (kb.isTextual() && !kb.asText().isBlank()) {
                    repo = Path.of(kb.asText()).getParent(); // knowledge 的父目录 = 仓库根
                }
                map.put(e.getKey(), repo);
            }
        } catch (Exception ex) {
            log.debug("读取 MCP 配置失败：{}", ex.getMessage());
        }
        return map;
    }

    /** 在指定 git 仓目录跑一条 git 命令，返回 trim 后 stdout；失败/超时返回空串。 */
    private String gitOutput(Path dir, long timeoutMs, String... args) {
        CommandResult result = gitCapture(dir, timeoutMs, args);
        return result.exitCode == 0 ? result.output.trim() : "";
    }

    private CommandResult gitCapture(Path dir, long timeoutMs, String... args) {
        try {
            List<String> cmd = new ArrayList<>();
            cmd.add("git");
            for (String a : args) cmd.add(a);
            Process p = new ProcessBuilder(cmd).directory(dir.toFile()).redirectErrorStream(true).start();
            if (!p.waitFor(timeoutMs, TimeUnit.MILLISECONDS)) {
                p.destroyForcibly();
                return new CommandResult(-1, "");
            }
            String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            return new CommandResult(p.exitValue(), out);
        } catch (Exception e) {
            return new CommandResult(-1, "");
        }
    }

    private static String nullIfBlank(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    /** 从某市场的 marketplace.json 按插件名取可用版本；取不到为 null。 */
    private String readMarketplaceVersion(Path home, String marketplace, String pluginName) {
        if (marketplace == null || marketplace.isBlank()) {
            return null;
        }
        try {
            Path mkFile = home.resolve(".claude/plugins/marketplaces/" + marketplace
                    + "/.claude-plugin/marketplace.json");
            if (!Files.exists(mkFile)) {
                return null;
            }
            JsonNode arr = mapper.readTree(mkFile.toFile()).path("plugins");
            if (arr.isArray()) {
                for (JsonNode p : arr) {
                    if (pluginName.equals(p.path("name").asText(null))) {
                        return p.path("version").asText(null);
                    }
                }
            }
        } catch (Exception ex) {
            log.debug("读取市场 {} 版本失败：{}", marketplace, ex.getMessage());
        }
        return null;
    }

    // ===== 一键更新(SSE 实时回显)=====

    /** 拉取/快进更新全部依赖仓，构建 MCP 引擎，并安装到 Claude Code 与 Codex。 */
    public void startInstall(String taskId, String sessionId, String requestedSource) {
        Path codexHome = resolveCodexHome(sessionId);
        Thread.ofVirtual().name("plugin-install-" + taskId).start(() -> {
            List<Map<String, Object>> results = new ArrayList<>();
            try {
                Thread.sleep(150);
                String source = normalizeSource(requestedSource);
                Path workspace = dependencyWorkspace();
                Files.createDirectories(workspace);
                sse.publish(taskId, "message", Map.of("type", "line", "engine", "git",
                        "text", "使用 " + source.toUpperCase(Locale.ROOT) + " 源，目录：" + workspace));
                for (String repo : DEPENDENCY_REPOS) {
                    String url = repoUrl(repo, source);
                    Path dir = workspace.resolve(repo).normalize();
                    Map<String, Object> syncResult;
                    if (!dir.getParent().equals(workspace)) {
                        throw new IllegalStateException("非法依赖仓库路径: " + dir);
                    }
                    if (Files.isDirectory(dir.resolve(".git"))) {
                        String currentRemote = gitOutput(dir, 5_000, "remote", "get-url", "origin");
                        if (!sameGitRemote(currentRemote, url)) {
                            sse.publish(taskId, "message", Map.of("type", "line", "engine", "git",
                                    "text", "切换源：移除 " + dir + "（" + currentRemote + " → " + url + "）"));
                            deleteRepository(workspace, dir);
                            syncResult = runStep(taskId, "git", "clone:" + repo,
                                    List.of("git", "clone", url, dir.toString()), null, workspace);
                        } else {
                            syncResult = runStep(taskId, "git", "pull:" + repo,
                                    List.of("git", "pull", "--ff-only"), null, dir);
                        }
                    } else if (Files.exists(dir)) {
                        throw new IllegalStateException("目标已存在但不是 Git 仓库: " + dir);
                    } else {
                        syncResult = runStep(taskId, "git", "clone:" + repo,
                                List.of("git", "clone", url, dir.toString()), null, workspace);
                    }
                    results.add(syncResult);
                    if (Boolean.TRUE.equals(syncResult.get("ok"))) {
                        recordSuccessfulSync(workspace, repo, source);
                    }
                }

                Path engineRepo = workspace.resolve("project-domain-knowledge");
                results.add(runStep(taskId, "mcp", "npm-install",
                        List.of("npm", "install"), null, engineRepo));
                results.add(runStep(taskId, "mcp", "npm-build",
                        List.of("npm", "run", "build"), null, engineRepo));

                installPlugins(taskId, codexHome, source, results);
                installMcps(taskId, codexHome, workspace, results);
                sse.publish(taskId, "message", Map.of("type", "done", "results", results));
            } catch (Exception e) {
                sse.publish(taskId, "message", Map.of("type", "error", "message", String.valueOf(e.getMessage())));
            } finally {
                sse.complete(taskId);
            }
        });
    }

    /** 后台校验五个团队仓库的本地变更，提交有效文件并推送到所选 Git 源。 */
    public void startPushRepositories(String taskId, String requestedSource) {
        Thread.ofVirtual().name("repository-push-" + taskId).start(() -> {
            List<Map<String, Object>> results = new ArrayList<>();
            try {
                Thread.sleep(150);
                String source = normalizeSource(requestedSource);
                Path workspace = dependencyWorkspace();
                sse.publish(taskId, "message", Map.of("type", "line", "engine", "git",
                        "text", "校验并推送团队仓库，目标源：" + source.toUpperCase(Locale.ROOT)));
                for (String repoName : DEPENDENCY_REPOS) {
                    results.add(pushRepository(taskId, workspace, repoName, source));
                }
                sse.publish(taskId, "message", Map.of("type", "done", "results", results));
            } catch (Exception e) {
                sse.publish(taskId, "message", Map.of("type", "error", "message", String.valueOf(e.getMessage())));
            } finally {
                sse.complete(taskId);
            }
        });
    }

    private Map<String, Object> pushRepository(String taskId, Path workspace, String repoName, String source) {
        Path repo = workspace.resolve(repoName).toAbsolutePath().normalize();
        if (!workspace.toAbsolutePath().normalize().equals(repo.getParent()) || !Files.isDirectory(repo.resolve(".git"))) {
            return repositoryFailure(taskId, repoName, "仓库不存在或不在团队工作区");
        }
        try {
            RepositoryTarget target = prepareRepositoryTarget(taskId, repo, repoName, source);
            NewFilePlan plan = inspectNewFiles(repo);
            if (!plan.rejectedFiles().isEmpty()) {
                return repositoryFailure(taskId, repoName,
                        "存在无法自动确认的新文件：" + String.join(", ", plan.rejectedFiles()));
            }
            List<String> stagedFiles = stageRepositoryChanges(repo, plan);
            if (stagedFiles.isEmpty()) {
                sse.publish(taskId, "message", Map.of("type", "line", "engine", "git",
                        "text", repoName + "：没有需要提交的有效更新"));
                return Map.of("repo", repoName, "ok", true, "changed", false);
            }
            return commitAndPushRepository(taskId, workspace, repo, repoName, source, target, stagedFiles);
        } catch (IllegalStateException e) {
            return repositoryFailure(taskId, repoName, e.getMessage());
        }
    }

    /** 校准目标源并确认本地分支未落后远端。 */
    private RepositoryTarget prepareRepositoryTarget(
            String taskId, Path repo, String repoName, String source) {
        String branch = gitOutput(repo, 5_000, "branch", "--show-current");
        if (branch.isBlank()) {
            throw new IllegalStateException("当前处于 detached HEAD，拒绝自动提交");
        }
        String targetUrl = repoUrl(repoName, source);
        String currentRemote = gitOutput(repo, 5_000, "remote", "get-url", "origin");
        if (currentRemote.isBlank()) {
            CommandResult addRemote = gitCapture(repo, 5_000, "remote", "add", "origin", targetUrl);
            requireGitSuccess(addRemote, "配置目标远端失败");
        } else if (!sameGitRemote(currentRemote, targetUrl)) {
            CommandResult switchRemote = gitCapture(repo, 5_000, "remote", "set-url", "origin", targetUrl);
            requireGitSuccess(switchRemote, "切换目标远端失败");
            sse.publish(taskId, "message", Map.of("type", "line", "engine", "git",
                    "text", repoName + "：origin 已切换为 " + source.toUpperCase(Locale.ROOT)));
        }
        CommandResult fetch = gitCapture(repo, 30_000, "fetch", "--quiet", "origin");
        requireGitSuccess(fetch, "无法读取目标远端");
        Integer behind = parseGitCount(gitOutput(repo, 5_000,
                "rev-list", "--count", "HEAD..origin/" + branch));
        if (behind == null || behind > 0) {
            throw new IllegalStateException(behind == null
                    ? "无法判断与目标远端的差异"
                    : "目标分支领先 " + behind + " 个提交，请先拉取更新");
        }
        return new RepositoryTarget(branch, targetUrl);
    }

    /** 将未跟踪文件分为可提交、可忽略和必须人工确认三类。 */
    private NewFilePlan inspectNewFiles(Path repo) {
        CommandResult untrackedResult = gitCapture(repo, 10_000,
                "ls-files", "--others", "--exclude-standard", "-z");
        requireGitSuccess(untrackedResult, "无法读取未跟踪文件");
        List<String> validNewFiles = new ArrayList<>();
        List<String> localIgnoreRules = new ArrayList<>();
        List<String> rejectedFiles = new ArrayList<>();
        CommandResult stagedNewResult = gitCapture(repo, 10_000,
                "diff", "--cached", "--name-only", "--diff-filter=A", "-z");
        requireGitSuccess(stagedNewResult, "无法核对已暂存的新文件");
        for (String relative : splitNullSeparated(stagedNewResult.output)) {
            if (!isValidNewFile(repo, relative)) rejectedFiles.add(relative);
        }
        for (String relative : splitNullSeparated(untrackedResult.output)) {
            String ignoreRule = localIgnoreRule(relative);
            if (ignoreRule != null) {
                if (!localIgnoreRules.contains(ignoreRule)) localIgnoreRules.add(ignoreRule);
            } else if (isValidNewFile(repo, relative)) {
                validNewFiles.add(relative);
            } else {
                rejectedFiles.add(relative);
            }
        }
        return new NewFilePlan(validNewFiles, localIgnoreRules, rejectedFiles);
    }

    /** 更新忽略规则并暂存全部已验证变更。 */
    private List<String> stageRepositoryChanges(Path repo, NewFilePlan plan) {
        List<String> validNewFiles = new ArrayList<>(plan.validNewFiles());
        boolean gitignoreCreated = appendGitignoreRules(repo, plan.localIgnoreRules());
        if (gitignoreCreated && !gitOutput(repo, 5_000, "ls-files", "--", ".gitignore").equals(".gitignore")) {
            validNewFiles.add(".gitignore");
        }
        CommandResult addTracked = gitCapture(repo, 15_000, "add", "-u");
        requireGitSuccess(addTracked, "暂存已跟踪文件失败");
        if (!validNewFiles.isEmpty()) {
            List<String> addArgs = new ArrayList<>(List.of("add", "--"));
            addArgs.addAll(validNewFiles);
            CommandResult addNew = gitCapture(repo, 20_000, addArgs.toArray(String[]::new));
            requireGitSuccess(addNew, "暂存新文件失败");
        }
        CommandResult staged = gitCapture(repo, 10_000, "diff", "--cached", "--name-only", "-z");
        requireGitSuccess(staged, "无法核对暂存文件");
        return splitNullSeparated(staged.output);
    }

    /** 使用真实 Git Author 生成规范提交并精确推送到所选源。 */
    private Map<String, Object> commitAndPushRepository(
            String taskId, Path workspace, Path repo, String repoName, String source,
            RepositoryTarget target, List<String> stagedFiles) {
        String authorName = gitOutput(repo, 5_000, "config", "user.name");
        String authorEmail = gitOutput(repo, 5_000, "config", "user.email");
        if (authorName.isBlank() || authorEmail.isBlank()) {
            throw new IllegalStateException("Git Author 未配置");
        }
        String body = "后台校验并提交 " + stagedFiles.size() + " 个有效文件，推送至 "
                + source.toUpperCase(Locale.ROOT) + "。";
        CommandResult commit = gitCapture(repo, 30_000, "commit",
                "-m", "chore(sync): 同步本地有效更新",
                "-m", body,
                "-m", "Author: " + authorName + " <" + authorEmail + ">");
        requireGitSuccess(commit, "提交失败");
        String commitId = gitOutput(repo, 5_000, "rev-parse", "--short", "HEAD");
        sse.publish(taskId, "message", Map.of("type", "line", "engine", "git",
                "text", repoName + "：已提交 " + commitId + "，正在推送 " + source.toUpperCase(Locale.ROOT)));
        CommandResult push = gitCapture(repo, 60_000, "push", target.url(),
                "HEAD:refs/heads/" + target.branch());
        if (push.exitCode != 0) {
            return repositoryFailure(taskId, repoName,
                    "提交 " + commitId + " 已保留，但推送失败：" + compactGitOutput(push.output));
        }
        recordSuccessfulSync(workspace, repoName, source);
        String residual = gitOutput(repo, 5_000, "status", "--porcelain");
        if (!residual.isBlank()) {
            sse.publish(taskId, "message", Map.of("type", "line", "engine", "git",
                    "text", repoName + "：推送成功，但任务期间又出现新的本地变更"));
        } else {
            sse.publish(taskId, "message", Map.of("type", "line", "engine", "git",
                    "text", repoName + "：推送成功，工作区已干净"));
        }
        return Map.of("repo", repoName, "ok", true, "changed", true, "commit", commitId,
                "clean", residual.isBlank());
    }

    private static void requireGitSuccess(CommandResult result, String action) {
        if (result.exitCode != 0) {
            throw new IllegalStateException(action + "：" + compactGitOutput(result.output));
        }
    }

    private Map<String, Object> repositoryFailure(String taskId, String repoName, String message) {
        sse.publish(taskId, "message", Map.of("type", "line", "engine", "git",
                "text", repoName + "：跳过 - " + message));
        return Map.of("repo", repoName, "ok", false, "message", message);
    }

    static List<String> splitNullSeparated(String output) {
        if (output == null || output.isEmpty()) return List.of();
        List<String> values = new ArrayList<>();
        for (String value : output.split("\\u0000")) {
            if (!value.isBlank()) values.add(value.replace('\\', '/'));
        }
        return values;
    }

    static String localIgnoreRule(String relative) {
        String path = relative.replace('\\', '/');
        for (String rule : List.of(".idea/", ".kai-chat-attachments/", ".vscode/", "dist/", "node_modules/",
                "target/", "graphify-out/")) {
            if (path.startsWith(rule)) return rule;
        }
        if (path.endsWith(".log") || path.endsWith(".tmp") || path.endsWith(".bak")) return "*" + path.substring(path.lastIndexOf('.'));
        return null;
    }

    static boolean isValidNewFile(Path repo, String relative) {
        String normalized = relative.replace('\\', '/');
        Path file = repo.resolve(normalized).toAbsolutePath().normalize();
        if (!file.startsWith(repo.toAbsolutePath().normalize()) || Files.isSymbolicLink(file)
                || !Files.isRegularFile(file)) return false;
        String name = file.getFileName().toString();
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.equals(".env") || (lower.startsWith(".env.") && !lower.equals(".env.example"))
                || lower.contains("credential") || lower.contains("secret") || lower.equals("id_rsa")
                || lower.endsWith(".key") || lower.endsWith(".pem") || lower.endsWith(".p12")
                || lower.endsWith(".jks")) return false;
        try {
            if (Files.size(file) > MAX_NEW_FILE_BYTES) return false;
        } catch (IOException e) {
            return false;
        }
        int slash = normalized.indexOf('/');
        if (slash < 0) return APPROVED_ROOT_FILES.contains(name);
        String root = normalized.substring(0, slash);
        int dot = lower.lastIndexOf('.');
        String extension = dot < 0 ? "" : lower.substring(dot + 1);
        return APPROVED_NEW_ROOTS.contains(root) && APPROVED_NEW_EXTENSIONS.contains(extension);
    }

    static boolean appendGitignoreRules(Path repo, List<String> rules) {
        if (rules.isEmpty()) return false;
        Path file = repo.resolve(".gitignore");
        try {
            String current = Files.exists(file) ? Files.readString(file, StandardCharsets.UTF_8) : "";
            StringBuilder updated = new StringBuilder(current);
            if (!current.isEmpty() && !current.endsWith("\n")) updated.append(System.lineSeparator());
            boolean changed = false;
            for (String rule : rules) {
                boolean exists = current.lines().map(String::trim).anyMatch(rule::equals);
                if (!exists) {
                    updated.append(rule).append(System.lineSeparator());
                    changed = true;
                }
            }
            if (changed) Files.writeString(file, updated.toString(), StandardCharsets.UTF_8);
            return changed;
        } catch (IOException e) {
            throw new IllegalStateException("更新 .gitignore 失败：" + e.getMessage(), e);
        }
    }

    private static String compactGitOutput(String output) {
        if (output == null || output.isBlank()) return "无输出";
        String compact = output.replaceAll("\\s+", " ").trim();
        return compact.length() <= 240 ? compact : compact.substring(0, 240) + "...";
    }

    private static String normalizeSource(String source) {
        String normalized = source == null ? "gitee" : source.trim().toLowerCase(Locale.ROOT);
        if (!normalized.equals("gitee") && !normalized.equals("github")) {
            throw new IllegalArgumentException("不支持的 Git 源：" + source);
        }
        return normalized;
    }

    private static String repoUrl(String repo, String source) {
        Map<String, String> owners = source.equals("github") ? GITHUB_OWNERS : GITEE_OWNERS;
        String host = source.equals("github") ? "github.com" : "gitee.com";
        return "https://" + host + "/" + owners.get(repo) + "/" + repo + ".git";
    }

    private static boolean sameGitRemote(String actual, String expected) {
        return normalizeGitRemote(actual).equals(normalizeGitRemote(expected));
    }

    private static String normalizeGitRemote(String value) {
        if (value == null) return "";
        return value.trim().replace('\\', '/').replaceAll("/+$", "")
                .replaceAll("(?i)\\.git$", "").toLowerCase(Locale.ROOT);
    }

    /** 只允许删除依赖工作区下、名称在固定白名单中的单个仓库。 */
    private static void deleteRepository(Path workspace, Path repo) throws IOException {
        Path safeWorkspace = workspace.toAbsolutePath().normalize();
        Path safeRepo = repo.toAbsolutePath().normalize();
        if (!safeWorkspace.equals(safeRepo.getParent()) || !DEPENDENCY_REPOS.contains(safeRepo.getFileName().toString())) {
            throw new IllegalStateException("拒绝删除非白名单依赖目录：" + safeRepo);
        }
        try (var paths = Files.walk(safeRepo)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                path.toFile().setWritable(true);
                Files.delete(path);
            }
        }
    }

    private Path dependencyWorkspace() {
        String configured = props.getDependencyWorkspace();
        if (configured != null && !configured.isBlank()) {
            return Path.of(configured).toAbsolutePath().normalize();
        }
        return Path.of(System.getProperty("user.home"), ".kai-toolbox", "team-tools")
                .toAbsolutePath().normalize();
    }

    private void installPlugins(String taskId, Path codexHome, String source, List<Map<String, Object>> results) {
        List<String> claude = List.of(props.getClaudeBin(), "plugin");
        List<String> codex = new ArrayList<>(codexParts());
        codex.add("plugin");
        for (String plugin : props.getWatchedPlugins()) {
            String url = repoUrl(plugin, source);
            results.add(runStep(taskId, "claude", "marketplace-remove:" + plugin,
                    concat(claude, "marketplace", "remove", plugin, "--scope", "user")));
            results.add(runStep(taskId, "claude", "marketplace-add:" + plugin,
                    concat(claude, "marketplace", "add", url)));
            results.add(runStep(taskId, "claude", "plugin-install:" + plugin,
                    concat(claude, "install", plugin + "@" + plugin, "--scope", "user")));
            results.add(runStep(taskId, "codex", "marketplace-remove:" + plugin,
                    concat(codex, "marketplace", "remove", plugin), codexHome));
            results.add(runStep(taskId, "codex", "marketplace-add:" + plugin,
                    concat(codex, "marketplace", "add", url), codexHome));
            results.add(runStep(taskId, "codex", "plugin-add:" + plugin,
                    concat(codex, "add", plugin + "@" + plugin), codexHome));
        }
    }

    private void installMcps(String taskId, Path codexHome, Path workspace, List<Map<String, Object>> results) {
        Path server = workspace.resolve("project-domain-knowledge/dist/server.js").toAbsolutePath();
        Map<String, Path> knowledgeDirs = Map.of(
                "domain-knowledge", workspace.resolve("project-domain-knowledge/knowledge").toAbsolutePath(),
                "cross-topology", workspace.resolve("cross-project-topology/knowledge").toAbsolutePath());
        for (Map.Entry<String, Path> mcp : knowledgeDirs.entrySet()) {
            results.add(runStep(taskId, "claude", "mcp-add:" + mcp.getKey(), List.of(props.getClaudeBin(), "mcp", "add",
                    "--scope", "user", mcp.getKey(), "--env", "DOMAIN_KB_DIR=" + mcp.getValue(), "--",
                    chatProps.getNodeCommand(), server.toString())));
            List<String> codex = new ArrayList<>(codexParts());
            codex.addAll(List.of("mcp", "add", mcp.getKey(), "--env", "DOMAIN_KB_DIR=" + mcp.getValue(), "--",
                    chatProps.getNodeCommand(), server.toString()));
            results.add(runStep(taskId, "codex", "mcp-add:" + mcp.getKey(), codex, codexHome));
        }
    }

    /**
     * 在虚拟线程按所选 Git 源重建 Claude/Codex marketplace 并安装插件，经 SSE(key=taskId)实时推流。
     * emitter 由调用方(controller)先 create 并返回给 Spring 挂上 HTTP;此处仅启动 worker,
     * 开头小睡确保 SSE 连接已建立再发首条,避免早发事件丢失。
     */
    public void startUpdate(String taskId, String sessionId, String requestedSource) {
        Path codexHome = resolveCodexHome(sessionId);
        Thread.ofVirtual().name("plugin-update-" + taskId).start(() -> {
            List<Map<String, Object>> results = new ArrayList<>();
            try {
                Thread.sleep(150); // 等 SSE HTTP 挂上
                String source = normalizeSource(requestedSource);
                sse.publish(taskId, "message", Map.of("type", "line", "engine", "plugin",
                        "text", "统一使用 " + source.toUpperCase(Locale.ROOT) + " 插件源"));
                installPlugins(taskId, codexHome, source, results);
                sse.publish(taskId, "message", Map.of("type", "done", "results", results));
            } catch (Exception e) {
                sse.publish(taskId, "message", Map.of("type", "error", "message", String.valueOf(e.getMessage())));
            } finally {
                sse.complete(taskId);
            }
        });
    }

    /** 跑一步命令,stdout/stderr 合并后逐行 publish;返回该步结果。 */
    private Map<String, Object> runStep(String taskId, String engine, String step, List<String> parts) {
        return runStep(taskId, engine, step, parts, null);
    }

    /** 跑一步命令，并可指定该进程使用的 Codex 授权目录。 */
    private Map<String, Object> runStep(String taskId, String engine, String step, List<String> parts, Path codexHome) {
        return runStep(taskId, engine, step, parts, codexHome, null);
    }

    private Map<String, Object> runStep(String taskId, String engine, String step, List<String> parts,
                                        Path codexHome, Path workingDirectory) {
        sse.publish(taskId, "message", Map.of("type", "line", "engine", engine, "step", step,
                "text", "$ " + String.join(" ", parts)));
        int exit;
        try {
            ProcessBuilder builder = new ProcessBuilder(wrap(parts)).redirectErrorStream(true);
            if (workingDirectory != null) builder.directory(workingDirectory.toFile());
            applyCodexHome(builder, codexHome);
            Process p = builder.start();
            try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = br.readLine()) != null) {
                    sse.publish(taskId, "message", Map.of("type", "line", "engine", engine, "step", step, "text", line));
                }
            }
            if (!p.waitFor(props.getCommandTimeoutMs(), TimeUnit.MILLISECONDS)) {
                p.destroyForcibly();
                exit = -1;
                sse.publish(taskId, "message", Map.of("type", "line", "engine", engine, "step", step,
                        "text", "[超时,已强制结束]"));
            } else {
                exit = p.exitValue();
            }
        } catch (Exception e) {
            exit = -1;
            sse.publish(taskId, "message", Map.of("type", "line", "engine", engine, "step", step,
                    "text", "[执行异常] " + e.getMessage()));
        }
        sse.publish(taskId, "message", Map.of("type", "step", "engine", engine, "step", step, "exitCode", exit));
        return Map.of("engine", engine, "step", step, "ok", exit == 0, "exitCode", exit);
    }

    private CommandResult runCapture(List<String> parts) throws IOException, InterruptedException {
        return runCapture(parts, null);
    }

    /** 执行命令并捕获输出；Codex 命令显式绑定授权目录，空值表示默认目录。 */
    private CommandResult runCapture(List<String> parts, Path codexHome) throws IOException, InterruptedException {
        ProcessBuilder builder = new ProcessBuilder(wrap(parts)).redirectErrorStream(true);
        applyCodexHome(builder, codexHome);
        Process p = builder.start();
        // 状态面板只跑 list 命令，必须快速返回。旧实现先 readLine 再 waitFor，CLI 卡住时
        // 会永远阻塞在读流，配置的超时实际不生效，表现为面板长时间“加载中”。
        long timeoutMs = Math.min(props.getCommandTimeoutMs(), 10_000L);
        int exit = p.waitFor(timeoutMs, TimeUnit.MILLISECONDS) ? p.exitValue() : forceKill(p);
        String output = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        return new CommandResult(exit, output);
    }

    private static int forceKill(Process p) {
        p.destroyForcibly();
        return -1;
    }

    /** 按会话读取 Codex Home；会话不存在或未配置时使用 Codex 默认目录。 */
    private Path resolveCodexHome(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            return null;
        }
        return sessionRepository.findById(sessionId)
                .map(session -> nullIfBlank(session.getCodexHome()))
                .map(Path::of)
                .orElse(null);
    }

    /** 防止后端进程继承的 CODEX_HOME 污染本次命令。 */
    private static void applyCodexHome(ProcessBuilder builder, Path codexHome) {
        if (codexHome == null) {
            builder.environment().remove("CODEX_HOME");
            return;
        }
        builder.environment().put("CODEX_HOME", codexHome.toAbsolutePath().normalize().toString());
    }

    /** Windows 下经 cmd /c 调(claude 是 .cmd/.ps1 shim);其它平台直接执行。 */
    private List<String> wrap(List<String> parts) {
        if (!WINDOWS) return parts;
        List<String> cmd = new ArrayList<>(parts.size() + 2);
        cmd.add("cmd");
        cmd.add("/c");
        cmd.addAll(parts);
        return cmd;
    }

    /** Codex 调用命令：配置优先，其次 sidecar 内置 CLI，最后回退 PATH 上的 codex。 */
    private List<String> codexParts() {
        String configured = props.getCodexCmd();
        if (configured != null && !configured.isBlank()) {
            return List.of(configured.trim().split("\\s+"));
        }
        Path codexJs = sidecarRegistry.sidecarDir()
                .resolve("node_modules").resolve("@openai").resolve("codex").resolve("bin").resolve("codex.js")
                .toAbsolutePath().normalize();
        if (Files.isRegularFile(codexJs)) {
            return List.of(chatProps.getNodeCommand(), codexJs.toString());
        }
        log.warn("sidecar 内置 Codex CLI 不存在：{}，回退 PATH 上的 codex", codexJs);
        return List.of("codex");
    }

    private static List<String> concat(List<String> base, String... more) {
        List<String> r = new ArrayList<>(base);
        for (String m : more) r.add(m);
        return r;
    }

    private record RepositoryTarget(String branch, String url) {}

    private record NewFilePlan(
            List<String> validNewFiles,
            List<String> localIgnoreRules,
            List<String> rejectedFiles) {}

    private record CommandResult(int exitCode, String output) {}
}
