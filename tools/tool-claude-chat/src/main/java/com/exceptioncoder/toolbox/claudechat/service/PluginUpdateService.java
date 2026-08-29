package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.PluginStatusView;
import com.exceptioncoder.toolbox.claudechat.api.dto.PluginStatusView.EngineStatus;
import com.exceptioncoder.toolbox.claudechat.api.dto.SuiteStatusView;
import com.exceptioncoder.toolbox.claudechat.api.dto.SkillSyncResultView;
import com.exceptioncoder.toolbox.claudechat.api.dto.TeamDependencyEnvironmentView;
import com.exceptioncoder.toolbox.claudechat.api.dto.TeamDependencyEnvironmentView.ToolView;
import com.exceptioncoder.toolbox.claudechat.api.dto.TeamRepositoryStatusView;
import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
import com.exceptioncoder.toolbox.claudechat.config.PluginUpdateProperties;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.common.git.GitFileDiffResponse;
import com.exceptioncoder.toolbox.common.git.GitLogService;
import com.exceptioncoder.toolbox.common.git.GitStatusResponse;
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
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
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
    private static final Pattern WINDOWS_ABSOLUTE_PATH = Pattern.compile("^[A-Za-z]:[\\\\/].*");
    private static final Pattern SKILL_NAME = Pattern.compile("(?m)^name:\\s*yoooni-erp-auto-dev\\s*$");
    private static final Pattern SKILL_DESCRIPTION = Pattern.compile("(?m)^description:\\s*\\S.+$");
    private static final String ERP_AUTO_DEV_SKILL = "yoooni-erp-auto-dev";

    private final PluginUpdateProperties props;
    private final ClaudeChatProperties chatProps;
    private final ClaudeChatSessionRepository sessionRepository;
    private final SseEmitterRegistry sse;
    private final ObjectMapper mapper;
    private final SidecarProcessRegistry sidecarRegistry;
    private final GitLogService gitLogService;
    private final TeamDependencyVersionService dependencyVersionService;

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
                               SidecarProcessRegistry sidecarRegistry,
                               GitLogService gitLogService,
                               TeamDependencyVersionService dependencyVersionService) {
        this.props = props;
        this.chatProps = chatProps;
        this.sessionRepository = sessionRepository;
        this.sse = sse;
        this.mapper = mapper;
        this.sidecarRegistry = sidecarRegistry;
        this.gitLogService = gitLogService;
        this.dependencyVersionService = dependencyVersionService;
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

    /**
     * 读取固定团队依赖仓库的未提交文件。
     *
     * @param repository 团队依赖仓库名
     * @return Git 工作区状态
     */
    public GitStatusResponse readRepositoryChanges(String repository) {
        return gitLogService.gitStatus(resolveDependencyRepository(repository));
    }

    /**
     * 读取固定团队依赖仓库中单个文件的差异。
     *
     * @param repository 团队依赖仓库名
     * @param filePath 仓库内相对文件路径
     * @param indexStatus 暂存区状态字符
     * @return 文件差异
     */
    public GitFileDiffResponse readRepositoryFileDiff(
            String repository, String filePath, String indexStatus) {
        if (!isValidRepositoryFilePath(filePath)) {
            throw new IllegalArgumentException("非法文件路径");
        }
        return gitLogService.gitFileDiff(
                resolveDependencyRepository(repository), filePath, indexStatus);
    }

    static boolean isValidRepositoryFilePath(String filePath) {
        if (filePath == null || filePath.isBlank() || filePath.startsWith("/")
                || filePath.startsWith("\\") || WINDOWS_ABSOLUTE_PATH.matcher(filePath).matches()) {
            return false;
        }
        try {
            Path normalized = Path.of(filePath).normalize();
            return !normalized.isAbsolute() && !normalized.startsWith("..");
        } catch (RuntimeException exception) {
            return false;
        }
    }

    /**
     * 以团队依赖工作区为唯一源，同步 ERP 自动开发 Skill 到双端最新缓存版本。
     * 接口不接受路径参数，避免扩展为任意文件复制能力。
     */
    public SkillSyncResultView syncYoooniErpAutoDev() {
        Path source = dependencyWorkspace().resolve("yoooni-daily-plugin/plugins/yoooni-daily-plugin/skills")
                .resolve(ERP_AUTO_DEV_SKILL).resolve("SKILL.md").toAbsolutePath().normalize();
        validateSkillSource(source);
        String sourceHash = sha256(source);
        Path userHome = Path.of(System.getProperty("user.home")).toAbsolutePath().normalize();
        List<SkillSyncResultView.TargetView> targets = List.of(
                syncSkillTarget("codex", userHome.resolve(".codex/plugins/cache/yoooni-daily-plugin/yoooni-daily-plugin"), source, sourceHash),
                syncSkillTarget("claude", userHome.resolve(".claude/plugins/cache/yoooni-daily-plugin/yoooni-daily-plugin"), source, sourceHash));
        return new SkillSyncResultView(ERP_AUTO_DEV_SKILL, source.toString(), sourceHash, targets);
    }

    private static void validateSkillSource(Path source) {
        if (!Files.isRegularFile(source)) {
            throw new IllegalStateException("团队源码 Skill 不存在：" + source);
        }
        try {
            String content = Files.readString(source, StandardCharsets.UTF_8);
            if (!content.startsWith("---") || !SKILL_NAME.matcher(content).find()
                    || !SKILL_DESCRIPTION.matcher(content).find()) {
                throw new IllegalStateException("团队源码 SKILL.md 的 frontmatter 不合法");
            }
        } catch (IOException e) {
            throw new IllegalStateException("读取团队源码 Skill 失败：" + e.getMessage(), e);
        }
    }

    private static SkillSyncResultView.TargetView syncSkillTarget(
            String agent, Path cacheRoot, Path source, String sourceHash) {
        Path versionDir = latestVersionDirectory(cacheRoot);
        if (versionDir == null) {
            return new SkillSyncResultView.TargetView(agent, null, null, "missing", "未找到已安装的插件缓存");
        }
        Path target = versionDir.resolve("skills").resolve(ERP_AUTO_DEV_SKILL).resolve("SKILL.md")
                .toAbsolutePath().normalize();
        Path safeRoot = cacheRoot.toAbsolutePath().normalize();
        if (!target.startsWith(safeRoot) || !Files.isRegularFile(target)) {
            return new SkillSyncResultView.TargetView(agent, versionDir.getFileName().toString(), target.toString(),
                    "missing", "当前版本未包含该 Skill");
        }
        Path temporary = target.resolveSibling("SKILL.md.tmp");
        try {
            Files.copy(source, temporary, StandardCopyOption.REPLACE_EXISTING);
            try {
                Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException atomicFailure) {
                Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING);
            }
            if (!sourceHash.equals(sha256(target))) {
                throw new IllegalStateException("同步后哈希校验失败");
            }
            return new SkillSyncResultView.TargetView(agent, versionDir.getFileName().toString(), target.toString(),
                    "updated", "已与团队源码一致");
        } catch (Exception e) {
            try {
                Files.deleteIfExists(temporary);
            } catch (IOException ignore) {
                // 临时文件清理失败不覆盖原始错误
            }
            return new SkillSyncResultView.TargetView(agent, versionDir.getFileName().toString(), target.toString(),
                    "failed", e.getMessage());
        }
    }

    private static Path latestVersionDirectory(Path cacheRoot) {
        if (!Files.isDirectory(cacheRoot)) return null;
        try (var paths = Files.list(cacheRoot)) {
            return paths.filter(Files::isDirectory)
                    .filter(path -> SEMVER.matcher(path.getFileName().toString()).matches())
                    .max(Comparator.comparing(path -> semanticVersionKey(path.getFileName().toString())))
                    .orElse(null);
        } catch (IOException e) {
            return null;
        }
    }

    private static String semanticVersionKey(String value) {
        return java.util.Arrays.stream(value.split("\\."))
                .map(part -> String.format(Locale.ROOT, "%010d", Integer.parseInt(part)))
                .reduce("", String::concat);
    }

    private static String sha256(Path path) {
        try {
            byte[] bytes = Files.readAllBytes(path);
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            return java.util.HexFormat.of().formatHex(digest);
        } catch (IOException | NoSuchAlgorithmException e) {
            throw new IllegalStateException("计算 Skill 哈希失败：" + e.getMessage(), e);
        }
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
     * 默认只读取本地安装状态；fetch=true 时从所选 Git 源读取固定团队仓库的远端版本。
     * 单个仓库检查失败只记录在对应套件，不中断其余套件返回。
     */
    public List<SuiteStatusView> readSuites(String sessionId, boolean fetch, String requestedSource) {
        String source = normalizeSource(requestedSource);
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
            Path repository = dependencyWorkspace().resolve(name).toAbsolutePath().normalize();
            TeamDependencyVersionService.RemoteVersionSnapshot remote = dependencyVersionService.readPlugin(
                    repository, name, name, repoUrl(name, source), source, fetch);
            out.add(new SuiteStatusView(name, "plugin", marketplace, claudeVer, codexVer, available, present,
                    null, null, remote.behind(), remote.version(), remote.commit(), remote.commitDate(),
                    remote.checked(), remote.error()));
        }
        for (String name : props.getWatchedMcps()) {
            boolean configured = mcpRepos.containsKey(name);
            Path repo = mcpRepos.get(name);
            String commit = null;
            String date = null;
            String repositoryName = mcpRepositoryName(name);
            TeamDependencyVersionService.RemoteVersionSnapshot remote = TeamDependencyVersionService
                    .RemoteVersionSnapshot.notChecked();
            if (repo != null && Files.isDirectory(repo)) {
                commit = nullIfBlank(gitOutput(repo, 5_000, "rev-parse", "--short", "HEAD"));
                date = nullIfBlank(gitOutput(repo, 5_000, "log", "-1", "--format=%cs"));
                remote = dependencyVersionService.readMcp(repo, repositoryName,
                        repoUrl(repositoryName, source), source, fetch);
            } else if (fetch) {
                remote = TeamDependencyVersionService.RemoteVersionSnapshot.error("知识库仓库未配置或不存在");
            }
            out.add(new SuiteStatusView(name, "mcp", null, null, null, null, configured, commit, date,
                    remote.behind(), null, remote.commit(), remote.commitDate(), remote.checked(), remote.error()));
        }
        return out;
    }

    private static String mcpRepositoryName(String mcpName) {
        return switch (mcpName) {
            case "cross-topology" -> "cross-project-topology";
            case "domain-knowledge" -> "project-domain-knowledge";
            default -> throw new IllegalArgumentException("未知团队 MCP：" + mcpName);
        };
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
        startInstall(taskId, sessionId, requestedSource, "all");
    }

    /** 按目标引擎安装团队插件；all 保持原有完整套件安装行为。 */
    public void startInstall(String taskId, String sessionId, String requestedSource, String requestedTarget) {
        Thread.ofVirtual().name("plugin-install-" + taskId).start(() -> {
            try {
                String target = normalizePluginTarget(requestedTarget);
                Thread.sleep(150);
                List<Map<String, Object>> results = "all".equals(target)
                        ? installDependencies(taskId, sessionId, requestedSource)
                        : installTeamPlugins(taskId, sessionId, requestedSource, target);
                sse.publish(taskId, "message", Map.of("type", "done", "results", results));
            } catch (Exception e) {
                sse.publish(taskId, "message", Map.of("type", "error", "message", String.valueOf(e.getMessage())));
            } finally {
                sse.complete(taskId);
            }
        });
    }

    /** 同步执行五仓拉取、MCP 构建、双端插件与 MCP 安装，供上层初始化编排复用。 */
    public List<Map<String, Object>> installDependencies(String taskId, String sessionId, String requestedSource) {
        Path codexHome = resolveCodexHome(sessionId);
        String source = normalizeSource(requestedSource);
        Path workspace = dependencyWorkspace();
        List<Map<String, Object>> results = new ArrayList<>();
        try {
            Files.createDirectories(workspace);
        } catch (IOException exception) {
            throw new IllegalStateException("无法创建团队依赖目录：" + workspace, exception);
        }
        sse.publish(taskId, "message", Map.of("type", "line", "engine", "git",
                "text", "使用 " + source.toUpperCase(Locale.ROOT) + " 源，目录：" + workspace));
        Map<String, Boolean> synchronizedRepositories = syncDependencyRepositories(
                taskId, workspace, source, DEPENDENCY_REPOS, results);
        buildKnowledgeEngine(taskId, workspace, synchronizedRepositories, results);
        installPlugins(taskId, codexHome, workspace, synchronizedRepositories, "all", results);
        installMcps(taskId, codexHome, workspace, results);
        return results;
    }

    private List<Map<String, Object>> installTeamPlugins(
            String taskId, String sessionId, String requestedSource, String target) {
        Path codexHome = resolveCodexHome(sessionId);
        String source = normalizeSource(requestedSource);
        Path workspace = dependencyWorkspace();
        List<Map<String, Object>> results = new ArrayList<>();
        try {
            Files.createDirectories(workspace);
        } catch (IOException exception) {
            throw new IllegalStateException("无法创建团队依赖目录：" + workspace, exception);
        }
        Map<String, Boolean> synchronizedRepositories = syncDependencyRepositories(
                taskId, workspace, source, props.getWatchedPlugins(), results);
        installPlugins(taskId, codexHome, workspace, synchronizedRepositories, target, results);
        return results;
    }

    private void buildKnowledgeEngine(String taskId, Path workspace,
                                      Map<String, Boolean> synchronizedRepositories,
                                      List<Map<String, Object>> results) {
        Path engineRepo = workspace.resolve("project-domain-knowledge");
        if (!Boolean.TRUE.equals(synchronizedRepositories.get("project-domain-knowledge"))) {
            publishSkippedStep(taskId, "mcp", "npm-install", "知识库仓库同步失败");
            publishSkippedStep(taskId, "mcp", "npm-build", "知识库仓库同步失败");
            return;
        }
        Map<String, Object> npmInstall = runStep(taskId, "mcp", "npm-install",
                List.of("npm", "install"), null, engineRepo);
        results.add(npmInstall);
        if (stepSucceeded(npmInstall)) {
            results.add(runStep(taskId, "mcp", "npm-build",
                    List.of("npm", "run", "build"), null, engineRepo));
        } else {
            publishSkippedStep(taskId, "mcp", "npm-build", "npm install 失败");
        }
    }

    /** 同步固定团队依赖仓库，并返回每个仓库是否可用于后续安装。 */
    private Map<String, Boolean> syncDependencyRepositories(
            String taskId, Path workspace, String source, List<String> repositories,
            List<Map<String, Object>> results) {
        Map<String, Boolean> synchronizedRepositories = new HashMap<>();
        for (String repository : repositories) {
            try {
                String url = repoUrl(repository, source);
                Path directory = workspace.resolve(repository).normalize();
                Map<String, Object> syncResult;
                if (!directory.getParent().equals(workspace)) {
                    throw new IllegalStateException("非法依赖仓库路径: " + directory);
                }
                if (Files.isDirectory(directory.resolve(".git"))) {
                    String currentRemote = gitOutput(directory, 5_000, "remote", "get-url", "origin");
                    CommandResult status = gitCapture(directory, 5_000, "status", "--porcelain");
                    if (status.exitCode() != 0) {
                        throw new IllegalStateException("无法检查本地仓库状态: " + directory);
                    }
                    if (!status.output().isBlank()) {
                        throw new IllegalStateException("本地仓库存在未提交修改，已停止拉取并保留现场: " + directory);
                    }
                    if (!sameGitRemote(currentRemote, url)) {
                        sse.publish(taskId, "message", Map.of("type", "line", "engine", "git",
                                "text", "已有仓库沿用 origin：" + currentRemote
                                        + "；默认源仅用于新克隆，不改写本地配置"));
                    }
                    syncResult = runStep(taskId, "git", "pull:" + repository,
                            List.of("git", "pull", "--ff-only"), null, directory);
                } else if (Files.exists(directory)) {
                    throw new IllegalStateException("目标已存在但不是 Git 仓库: " + directory);
                } else {
                    syncResult = runStep(taskId, "git", "clone:" + repository,
                            List.of("git", "clone", url, directory.toString()), null, workspace);
                }
                results.add(syncResult);
                boolean synchronizedRepository = stepSucceeded(syncResult);
                synchronizedRepositories.put(repository, synchronizedRepository);
                if (synchronizedRepository) {
                    String synchronizedSource = Files.isDirectory(directory.resolve(".git"))
                            ? gitSource(gitOutput(directory, 5_000, "remote", "get-url", "origin"), source)
                            : source;
                    recordSuccessfulSync(workspace, repository, synchronizedSource);
                }
            } catch (IllegalStateException exception) {
                synchronizedRepositories.put(repository, false);
                results.add(repositoryFailure(taskId, repository, exception.getMessage()));
            }
        }
        return synchronizedRepositories;
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

    static String gitSource(String remote, String fallback) {
        String normalized = normalizeGitRemote(remote);
        if (normalized.contains("github.com")) return "github";
        if (normalized.contains("gitee.com")) return "gitee";
        return fallback;
    }

    private Path dependencyWorkspace() {
        String configured = props.getDependencyWorkspace();
        if (configured != null && !configured.isBlank()) {
            return Path.of(configured).toAbsolutePath().normalize();
        }
        return Path.of(System.getProperty("user.home"), ".kai-toolbox", "team-tools")
                .toAbsolutePath().normalize();
    }

    /** 仅从固定团队依赖工作区解析白名单仓库，禁止前端传入任意路径。 */
    private Path resolveDependencyRepository(String repository) {
        if (!DEPENDENCY_REPOS.contains(repository)) {
            throw new IllegalArgumentException("未知团队依赖仓库：" + repository);
        }
        Path workspace = dependencyWorkspace();
        Path resolved = workspace.resolve(repository).toAbsolutePath().normalize();
        if (!resolved.startsWith(workspace) || !Files.isDirectory(resolved.resolve(".git"))) {
            throw new IllegalStateException("团队依赖仓库尚未拉取：" + repository);
        }
        return resolved;
    }

    private void installPlugins(
            String taskId, Path codexHome, Path workspace, Map<String, Boolean> synchronizedRepositories,
            String target, List<Map<String, Object>> results) {
        List<String> claude = List.of(props.getClaudeBin(), "plugin");
        List<String> codex = new ArrayList<>(codexParts());
        codex.add("plugin");
        Map<String, JsonNode> claudeMarketplaces = "codex".equals(target) ? null
                : readMarketplaceRegistrationsSafely(taskId, "claude", claude, null, results);
        Map<String, JsonNode> codexMarketplaces = "claude".equals(target) ? null
                : readMarketplaceRegistrationsSafely(taskId, "codex", codex, codexHome, results);
        Map<String, String[]> claudeInstalledPlugins = readInstalledPluginMap(
                Path.of(System.getProperty("user.home")));
        for (String plugin : props.getWatchedPlugins()) {
            if (Boolean.FALSE.equals(synchronizedRepositories.get(plugin))) {
                publishSkippedStep(taskId, "plugin", "install:" + plugin, "团队仓库同步失败");
                results.add(skippedStep("plugin", "install:" + plugin, "团队仓库同步失败"));
                continue;
            }
            Path marketplaceDirectory = workspace.resolve(plugin).toAbsolutePath().normalize();
            try {
                validateMarketplaceDirectory(marketplaceDirectory, plugin);
            } catch (IllegalStateException exception) {
                publishSkippedStep(taskId, "plugin", "install:" + plugin, exception.getMessage());
                results.add(skippedStep("plugin", "install:" + plugin, exception.getMessage()));
                continue;
            }
            if (claudeMarketplaces != null) {
                installClaudePlugin(taskId, claude, plugin, marketplaceDirectory,
                        claudeMarketplaces.get(plugin), claudeInstalledPlugins.containsKey(plugin), results);
            }
            if (codexMarketplaces != null) {
                installCodexPlugin(taskId, codex, codexHome, plugin, marketplaceDirectory,
                        codexMarketplaces.get(plugin), results);
            }
        }
    }

    static String normalizePluginTarget(String target) {
        String normalized = target == null ? "all" : target.trim().toLowerCase(Locale.ROOT);
        if (!List.of("all", "claude", "codex").contains(normalized)) {
            throw new IllegalArgumentException("团队插件安装目标只支持 all、claude 或 codex");
        }
        return normalized;
    }

    private Map<String, JsonNode> readMarketplaceRegistrationsSafely(
            String taskId, String engine, List<String> pluginCommand, Path codexHome,
            List<Map<String, Object>> results) {
        try {
            return readMarketplaceRegistrations(pluginCommand, codexHome);
        } catch (IllegalStateException exception) {
            String step = "marketplace-list";
            sse.publish(taskId, "message", Map.of("type", "line", "engine", engine, "step", step,
                    "text", "[失败] " + exception.getMessage()));
            results.add(failedStep(engine, step, exception.getMessage()));
            return null;
        }
    }

    private void installClaudePlugin(
            String taskId, List<String> claude, String plugin, Path marketplaceDirectory,
            JsonNode currentMarketplace, boolean installed, List<Map<String, Object>> results) {
        boolean ready = ensureLocalMarketplace(taskId, "claude", plugin, marketplaceDirectory,
                currentMarketplace,
                concat(claude, "marketplace", "remove", plugin, "--scope", "user"),
                concat(claude, "marketplace", "add", marketplaceDirectory.toString()), null, results);
        if (!ready) {
            publishSkippedStep(taskId, "claude", "plugin-install:" + plugin, "marketplace 未就绪");
            results.add(skippedStep("claude", "plugin-install:" + plugin, "marketplace 未就绪"));
            return;
        }
        String action = installed ? "update" : "install";
        results.add(runStep(taskId, "claude", "plugin-" + action + ":" + plugin,
                claudePluginCommand(claude, plugin, installed)));
    }

    /** 已安装插件必须走 update；install 会以 already installed 成功退出但不会刷新版本。 */
    static List<String> claudePluginCommand(List<String> claude, String plugin, boolean installed) {
        return concat(claude, installed ? "update" : "install",
                plugin + "@" + plugin, "--scope", "user");
    }

    private void installCodexPlugin(
            String taskId, List<String> codex, Path codexHome, String plugin, Path marketplaceDirectory,
            JsonNode currentMarketplace, List<Map<String, Object>> results) {
        boolean ready = ensureLocalMarketplace(taskId, "codex", plugin, marketplaceDirectory,
                currentMarketplace,
                concat(codex, "marketplace", "remove", plugin),
                concat(codex, "marketplace", "add", marketplaceDirectory.toString()), codexHome, results);
        if (!ready) {
            publishSkippedStep(taskId, "codex", "plugin-add:" + plugin, "marketplace 未就绪");
            results.add(skippedStep("codex", "plugin-add:" + plugin, "marketplace 未就绪"));
            return;
        }
        results.add(runStep(taskId, "codex", "plugin-add:" + plugin,
                concat(codex, "add", plugin + "@" + plugin), codexHome));
    }

    /** 将已登记 marketplace 安全切换到本地团队仓库；本地来源未变化时不执行 remove。 */
    private boolean ensureLocalMarketplace(
            String taskId, String engine, String plugin, Path marketplaceDirectory,
            JsonNode currentMarketplace, List<String> removeCommand, List<String> addCommand,
            Path codexHome, List<Map<String, Object>> results) {
        if (currentMarketplace != null && marketplaceUsesLocalDirectory(currentMarketplace, marketplaceDirectory)) {
            sse.publish(taskId, "message", Map.of("type", "line", "engine", engine,
                    "step", "marketplace-ready:" + plugin,
                    "text", "marketplace 已指向本地团队仓库，跳过重复登记"));
            results.add(Map.of("engine", engine, "step", "marketplace-ready:" + plugin,
                    "ok", true, "skipped", true));
            return true;
        }
        if (currentMarketplace != null) {
            Map<String, Object> removeResult = runStep(taskId, engine,
                    "marketplace-remove:" + plugin, removeCommand, codexHome);
            results.add(removeResult);
            if (!stepSucceeded(removeResult)) {
                return false;
            }
        }
        Map<String, Object> addResult = runStep(taskId, engine,
                "marketplace-add-local:" + plugin, addCommand, codexHome);
        results.add(addResult);
        return stepSucceeded(addResult);
    }

    private Map<String, JsonNode> readMarketplaceRegistrations(List<String> pluginCommand, Path codexHome) {
        try {
            CommandResult result = runCapture(concat(pluginCommand, "marketplace", "list", "--json"), codexHome);
            if (result.exitCode != 0) {
                throw new IllegalStateException("读取 marketplace 清单失败：" + compactGitOutput(result.output));
            }
            JsonNode root = parseJsonOutput(result.output);
            JsonNode marketplaces = root.isArray() ? root : root.path("marketplaces");
            Map<String, JsonNode> registrations = new HashMap<>();
            if (marketplaces.isArray()) {
                for (JsonNode marketplace : marketplaces) {
                    String name = marketplace.path("name").asText(null);
                    if (name != null && !name.isBlank()) {
                        registrations.put(name, marketplace);
                    }
                }
            }
            return registrations;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("读取 marketplace 清单失败：" + e.getMessage(), e);
        } catch (IOException e) {
            throw new IllegalStateException("读取 marketplace 清单失败：" + e.getMessage(), e);
        }
    }

    private JsonNode parseJsonOutput(String output) throws IOException {
        int objectStart = output.indexOf('{');
        int arrayStart = output.indexOf('[');
        int start = objectStart < 0 ? arrayStart : arrayStart < 0 ? objectStart : Math.min(objectStart, arrayStart);
        if (start < 0) {
            throw new IOException("CLI 未返回 JSON");
        }
        char opening = output.charAt(start);
        int end = opening == '{' ? output.lastIndexOf('}') : output.lastIndexOf(']');
        if (end < start) {
            throw new IOException("CLI 返回的 JSON 不完整");
        }
        return mapper.readTree(output.substring(start, end + 1));
    }

    private void validateMarketplaceDirectory(Path directory, String plugin) {
        if (!Files.isDirectory(directory.resolve(".git"))) {
            throw new IllegalStateException("团队插件仓库尚未拉取：" + plugin);
        }
        validateMarketplaceManifest(directory.resolve(".claude-plugin/marketplace.json"), plugin);
        validateMarketplaceManifest(directory.resolve(".agents/plugins/marketplace.json"), plugin);
    }

    private void validateMarketplaceManifest(Path manifest, String plugin) {
        try {
            JsonNode root = mapper.readTree(manifest.toFile());
            if (!plugin.equals(root.path("name").asText()) || !containsMarketplacePlugin(root, plugin)) {
                throw new IllegalStateException("marketplace 清单与插件名称不匹配：" + manifest);
            }
        } catch (IOException e) {
            throw new IllegalStateException("读取 marketplace 清单失败：" + manifest, e);
        }
    }

    private static boolean containsMarketplacePlugin(JsonNode root, String plugin) {
        for (JsonNode item : root.path("plugins")) {
            if (plugin.equals(item.path("name").asText())) {
                return true;
            }
        }
        return false;
    }

    static boolean marketplaceUsesLocalDirectory(JsonNode marketplace, Path directory) {
        Path expected = directory.toAbsolutePath().normalize();
        List<String> candidates = List.of(
                marketplace.path("root").asText(""),
                marketplace.path("path").asText(""),
                marketplace.path("installLocation").asText(""),
                marketplace.path("marketplaceSource").path("source").asText(""));
        for (String candidate : candidates) {
            if (sameLocalPath(candidate, expected)) {
                return true;
            }
        }
        return false;
    }

    private static boolean sameLocalPath(String candidate, Path expected) {
        if (candidate == null || candidate.isBlank() || candidate.contains("://")) {
            return false;
        }
        try {
            String normalized = candidate.startsWith("\\\\?\\") ? candidate.substring(4) : candidate;
            return Path.of(normalized).toAbsolutePath().normalize().equals(expected);
        } catch (RuntimeException exception) {
            return false;
        }
    }

    static boolean stepSucceeded(Map<String, Object> result) {
        return Boolean.TRUE.equals(result.get("ok"));
    }

    private void publishSkippedStep(String taskId, String engine, String step, String reason) {
        sse.publish(taskId, "message", Map.of("type", "line", "engine", engine, "step", step,
                "text", "[跳过] " + reason));
    }

    private static Map<String, Object> skippedStep(String engine, String step, String reason) {
        return Map.of("engine", engine, "step", step, "ok", false, "skipped", true, "reason", reason);
    }

    private static Map<String, Object> failedStep(String engine, String step, String reason) {
        return Map.of("engine", engine, "step", step, "ok", false, "reason", reason);
    }

    private void installMcps(String taskId, Path codexHome, Path workspace, List<Map<String, Object>> results) {
        Path server = workspace.resolve("project-domain-knowledge/dist/server.js").toAbsolutePath();
        Map<String, Path> knowledgeDirs = Map.of(
                "domain-knowledge", workspace.resolve("project-domain-knowledge/knowledge").toAbsolutePath(),
                "cross-topology", workspace.resolve("cross-project-topology/knowledge").toAbsolutePath());
        for (Map.Entry<String, Path> mcp : knowledgeDirs.entrySet()) {
            String name = mcp.getKey();
            List<String> claude = List.of(props.getClaudeBin(), "mcp");
            replaceMcpRegistration(taskId, "claude", name,
                    concat(claude, "get", name),
                    concat(claude, "remove", name, "--scope", "user"),
                    concat(claude, "add", "--scope", "user", name,
                            "--env", "DOMAIN_KB_DIR=" + mcp.getValue(), "--",
                            chatProps.getNodeCommand(), server.toString()),
                    null, results);

            List<String> codex = codexParts();
            replaceMcpRegistration(taskId, "codex", name,
                    concat(codex, "mcp", "get", name, "--json"),
                    concat(codex, "mcp", "remove", name),
                    concat(codex, "mcp", "add", name,
                            "--env", "DOMAIN_KB_DIR=" + mcp.getValue(), "--",
                            chatProps.getNodeCommand(), server.toString()),
                    codexHome, results);
        }
    }

    /** Replaces an existing MCP registration so its command and environment always match the latest build. */
    private void replaceMcpRegistration(
            String taskId, String engine, String name,
            List<String> getCommand, List<String> removeCommand, List<String> addCommand,
            Path codexHome, List<Map<String, Object>> results) {
        if (mcpRegistrationExists(captureExitCode(taskId, engine, name, getCommand, codexHome))) {
            Map<String, Object> removeResult = runStep(
                    taskId, engine, "mcp-remove:" + name, removeCommand, codexHome);
            results.add(removeResult);
            if (!stepSucceeded(removeResult)) {
                publishSkippedStep(taskId, engine, "mcp-add:" + name, "旧 MCP 配置删除失败");
                return;
            }
        }
        results.add(runStep(taskId, engine, "mcp-add:" + name, addCommand, codexHome));
    }

    private int captureExitCode(
            String taskId, String engine, String name, List<String> command, Path codexHome) {
        try {
            return runCapture(command, codexHome).exitCode();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            sse.publish(taskId, "message", Map.of("type", "line", "engine", engine,
                    "step", "mcp-get:" + name, "text", "[检查中断] 将继续尝试登记 MCP"));
            return -1;
        } catch (IOException exception) {
            sse.publish(taskId, "message", Map.of("type", "line", "engine", engine,
                    "step", "mcp-get:" + name, "text", "[检查失败] 将继续尝试登记 MCP：" + exception.getMessage()));
            return -1;
        }
    }

    static boolean mcpRegistrationExists(int getExitCode) {
        return getExitCode == 0;
    }

    /** 在虚拟线程同步五仓、重建知识引擎，并从固定本地工作区更新插件和 MCP。 */
    public void startUpdate(String taskId, String sessionId, String requestedSource) {
        Thread.ofVirtual().name("plugin-update-" + taskId).start(() -> {
            try {
                Thread.sleep(150); // 等 SSE HTTP 挂上
                List<Map<String, Object>> results = installDependencies(taskId, sessionId, requestedSource);
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
