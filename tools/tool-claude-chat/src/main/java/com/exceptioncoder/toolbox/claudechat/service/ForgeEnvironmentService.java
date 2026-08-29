package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ForgeEnvironmentView;
import com.exceptioncoder.toolbox.claudechat.api.dto.ForgeEnvironmentView.DependencyGroupView;
import com.exceptioncoder.toolbox.claudechat.api.dto.ForgeEnvironmentView.DependencyView;
import com.exceptioncoder.toolbox.claudechat.api.dto.SuiteStatusView;
import com.exceptioncoder.toolbox.claudechat.api.dto.TeamRepositoryStatusView;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 聚合 Forge 本机工具、公司套件与依赖仓库的只读就绪度。 */
@Service("claudeChatForgeEnvironmentService")
public class ForgeEnvironmentService {

    private static final Duration PROBE_TIMEOUT = Duration.ofSeconds(10);
    private static final Pattern VERSION = Pattern.compile("(?i)(?:v|version\\s*)?(\\d+)(?:\\.(\\d+))?(?:\\.(\\d+))?");
    private static final Pattern MAVEN_JAVA = Pattern.compile("(?im)^Java version:\\s*([^,\\r\\n]+)");
    private static final boolean WINDOWS = System.getProperty("os.name", "")
            .toLowerCase(Locale.ROOT).contains("win");
    private static final boolean MACOS = System.getProperty("os.name", "")
            .toLowerCase(Locale.ROOT).contains("mac");

    private final ForgeEnvironmentCommandRunner commandRunner;
    private final PluginUpdateService pluginUpdateService;

    public ForgeEnvironmentService(ForgeEnvironmentCommandRunner commandRunner,
                                   PluginUpdateService pluginUpdateService) {
        this.commandRunner = commandRunner;
        this.pluginUpdateService = pluginUpdateService;
    }

    /**
     * 读取完整环境快照，单项探测失败只影响对应依赖。
     *
     * @param sessionId 可选 Codex 会话授权目录
     * @param requestedSource 公司依赖源
     * @param fetch 是否刷新远端仓库
     * @return 分层就绪度快照
     */
    public ForgeEnvironmentView inspect(String sessionId, String requestedSource, boolean fetch) {
        commandRunner.refreshEnvironmentPath();
        String source = normalizeSource(requestedSource);
        List<DependencyGroupView> groups = List.of(
                coreGroup(),
                workflowGroup(),
                suiteGroup(pluginUpdateService.readSuites(sessionId, fetch, source)),
                repositoryGroup(pluginUpdateService.readRepositoryStatuses(source, fetch)),
                buildGroup());
        List<DependencyView> items = groups.stream().flatMap(group -> group.items().stream()).toList();
        int readyCount = (int) items.stream().filter(item -> "READY".equals(item.state())).count();
        int blockingCount = (int) items.stream().filter(DependencyView::blocking)
                .filter(item -> !"READY".equals(item.state())).count();
        boolean ready = blockingCount == 0;
        boolean attention = items.stream().anyMatch(item -> !"READY".equals(item.state()));
        return new ForgeEnvironmentView(ready ? attention ? "ATTENTION" : "READY" : "BLOCKED",
                ready, readyCount, items.size(), blockingCount, Instant.now().toString(), groups);
    }

    /** 读取单个固定工具，供初始化后复检。 */
    DependencyView inspectTool(String toolId) {
        return switch (toolId) {
            case "git" -> probe("git", "Git", List.of("git", "--version"), 2, 0, 0, true,
                    gitInstallCommand(), "https://git-scm.com/downloads");
            case "node" -> probeNode();
            case "python" -> probe("python", "Python", List.of("python", "--version"), 3, 10, 0, true,
                    pythonInstallCommand(), "https://www.python.org/downloads/");
            case "uv" -> probe("uv", "uv", List.of("uv", "--version"), 0, 0, 0, true,
                    uvInstallCommand(), "https://docs.astral.sh/uv/getting-started/installation/");
            case "claude" -> probe("claude", "Claude Code", List.of("claude", "--version"), 0, 0, 0, true,
                    "npm install --global @anthropic-ai/claude-code", "https://docs.anthropic.com/en/docs/claude-code/getting-started");
            case "codex" -> probe("codex", "Codex CLI", List.of("codex", "--version"), 0, 0, 0, true,
                    "npm install --global @openai/codex", "https://developers.openai.com/codex/cli/");
            case "graphify" -> probe("graphify", "Graphify", List.of("graphify", "--version"), 0, 0, 0, true,
                    "uv tool install graphifyy", "https://github.com/Graphify-Labs/graphify");
            case "openspec" -> probe("openspec", "OpenSpec", List.of("openspec", "--version"), 0, 0, 0, true,
                    "npm install --global @fission-ai/openspec@latest", "https://github.com/Fission-AI/OpenSpec/blob/main/docs/installation.md");
            default -> throw new IllegalArgumentException("未知 Forge 环境工具：" + toolId);
        };
    }

    /** 返回固定工具的安全安装 argv；空列表表示当前平台只提供手工恢复。 */
    List<String> installCommand(String toolId) {
        return switch (toolId) {
            case "git" -> WINDOWS ? winget("Git.Git") : MACOS ? List.of("brew", "install", "git") : List.of();
            case "node" -> WINDOWS ? winget("OpenJS.NodeJS.LTS") : MACOS ? List.of("brew", "install", "node") : List.of();
            case "python" -> WINDOWS ? List.of("uv", "python", "install", "3.12", "--default")
                    : MACOS ? List.of("brew", "install", "python@3.12") : List.of();
            case "uv" -> WINDOWS ? winget("astral-sh.uv") : MACOS ? List.of("brew", "install", "uv") : List.of();
            case "claude" -> List.of("npm", "install", "--global", "@anthropic-ai/claude-code");
            case "codex" -> List.of("npm", "install", "--global", "@openai/codex");
            case "graphify" -> List.of("uv", "tool", "install", "graphifyy");
            case "openspec" -> List.of("npm", "install", "--global", "@fission-ai/openspec@latest");
            default -> throw new IllegalArgumentException("未知 Forge 环境工具：" + toolId);
        };
    }

    private DependencyGroupView coreGroup() {
        return new DependencyGroupView("core", "核心前置", "仓库、运行时与双端 AI CLI",
                List.of(inspectTool("git"), inspectTool("node"), inspectTool("python"), inspectTool("uv"),
                        inspectTool("claude"), inspectTool("codex")));
    }

    private DependencyGroupView workflowGroup() {
        return new DependencyGroupView("workflow", "研发方法工具", "代码图谱与规格驱动工作流",
                List.of(inspectTool("graphify"), inspectTool("openspec")));
    }

    private DependencyGroupView suiteGroup(List<SuiteStatusView> suites) {
        List<DependencyView> items = suites.stream().map(suite -> {
            boolean ready = suite.kind().equals("plugin")
                    ? suite.claudeInstalled() != null && suite.codexInstalled() != null
                    : suite.present();
            String version = suite.kind().equals("plugin")
                    ? joinVersions(suite.claudeInstalled(), suite.codexInstalled())
                    : suite.repoCommit();
            String summary = ready ? "已接入 Forge 双端工具链" : suite.kind().equals("plugin")
                    ? "Claude Code 或 Codex 端尚未安装" : "MCP 尚未注册";
            return dependency("suite-" + suite.name(), suite.name(), ready ? "READY" : "MISSING", true,
                    version, summary, suite.remoteError(), null, null);
        }).toList();
        return new DependencyGroupView("suites", "公司套件", "团队规范、编码画像与业务知识能力", items);
    }

    private DependencyGroupView repositoryGroup(List<TeamRepositoryStatusView> repositories) {
        List<DependencyView> items = repositories.stream().map(repository -> {
            String summary = !repository.cloned() ? "团队仓库尚未拉取"
                    : !repository.sourceMatches() ? "origin 与默认 Gitee 源不一致，不影响已安装套件运行"
                    : repository.dirty() ? "仓库就绪，本地存在未提交改动" : "仓库已就绪";
            String state = !repository.cloned() ? "MISSING"
                    : !repository.sourceMatches() || repository.dirty() ? "ATTENTION" : "READY";
            return dependency("repo-" + repository.name(), repository.name(), state, !repository.cloned(),
                    repository.commit(), summary, repository.source(), null, null);
        }).toList();
        return new DependencyGroupView("repositories", "公司依赖仓", "统一位于 ~/.kai-toolbox/team-tools", items);
    }

    private DependencyGroupView buildGroup() {
        DependencyView java = probe("java", "Java", List.of("java", "--version"), 21, 0, 0, false,
                WINDOWS ? "winget install --id Microsoft.OpenJDK.21 -e --source winget" : "brew install openjdk@21",
                "https://learn.microsoft.com/en-us/java/openjdk/download");
        ForgeEnvironmentCommandRunner.CommandResult mavenResult = commandRunner.run(
                List.of("mvn", "--version"), PROBE_TIMEOUT, null, null);
        DependencyView maven = inspectMaven(mavenResult);
        return new DependencyGroupView("build", "本地源码构建", "用于编译和验证 kai-toolbox 源码", List.of(java, maven));
    }

    private DependencyView probeNode() {
        ForgeEnvironmentCommandRunner.CommandResult node = run(List.of("node", "--version"));
        ForgeEnvironmentCommandRunner.CommandResult npm = run(List.of("npm", "--version"));
        if (!node.succeeded() || !npm.succeeded()) {
            return dependency("node", "Node.js + npm", "MISSING", true, null,
                    "Node.js 或 npm 不可用", detail(node, npm), nodeInstallCommand(), "https://nodejs.org/en/download");
        }
        Version parsed = Version.parse(node.output());
        boolean compatible = parsed.atLeast(20, 19, 0);
        return dependency("node", "Node.js + npm", compatible ? "READY" : "INCOMPATIBLE", true,
                firstLine(node.output()) + " · npm " + firstLine(npm.output()),
                compatible ? "满足 OpenSpec 与公司 MCP 构建要求" : "OpenSpec 要求 Node.js 20.19+",
                compatible ? null : node.output(), nodeInstallCommand(), "https://nodejs.org/en/download");
    }

    private DependencyView inspectMaven(ForgeEnvironmentCommandRunner.CommandResult result) {
        if (!result.succeeded()) {
            return dependency("maven", "Maven", "ATTENTION", false, null,
                    "Maven 不可用，仅影响源码构建", result.output(), "choco install maven -y", "https://maven.apache.org/install.html");
        }
        Matcher matcher = MAVEN_JAVA.matcher(result.output());
        String javaVersion = matcher.find() ? matcher.group(1).trim() : null;
        boolean compatible = javaVersion != null && Version.parse(javaVersion).atLeast(21, 0, 0);
        return dependency("maven", "Maven", compatible ? "READY" : "ATTENTION", false,
                firstLine(result.output()), compatible ? "Maven 正在使用 Java 21+" : "Maven 未使用 Java 21",
                javaVersion == null ? result.output() : "Maven Java: " + javaVersion,
                "设置 JAVA_HOME 后重新打开终端", "https://maven.apache.org/install.html");
    }

    private DependencyView probe(String id, String name, List<String> command,
                                 int major, int minor, int patch, boolean blocking,
                                 String installCommand, String officialUrl) {
        ForgeEnvironmentCommandRunner.CommandResult result = run(command);
        if (!result.succeeded()) {
            return dependency(id, name, "MISSING", blocking, null, "未检测到可执行命令",
                    result.output(), installCommand, officialUrl);
        }
        boolean compatible = major == 0 || Version.parse(result.output()).atLeast(major, minor, patch);
        return dependency(id, name, compatible ? "READY" : "INCOMPATIBLE", blocking,
                firstLine(result.output()), compatible ? "已就绪" : "版本低于最低要求",
                compatible ? null : result.output(), installCommand, officialUrl);
    }

    private ForgeEnvironmentCommandRunner.CommandResult run(List<String> command) {
        return commandRunner.run(command, PROBE_TIMEOUT, null, null);
    }

    private static DependencyView dependency(String id, String name, String state, boolean blocking,
                                             String version, String summary, String detail,
                                             String installCommand, String officialUrl) {
        return new DependencyView(id, name, state, blocking, version, summary,
                blankToNull(detail), installCommand, officialUrl);
    }

    private static String normalizeSource(String requestedSource) {
        String value = requestedSource == null ? "gitee" : requestedSource.trim().toLowerCase(Locale.ROOT);
        if (!"gitee".equals(value) && !"github".equals(value)) {
            throw new IllegalArgumentException("Git 源只支持 gitee 或 github");
        }
        return value;
    }

    private static List<String> winget(String packageId) {
        return List.of("winget", "install", "--id", packageId, "-e", "--source", "winget",
                "--accept-package-agreements", "--accept-source-agreements", "--disable-interactivity");
    }

    private static String gitInstallCommand() {
        return WINDOWS ? "winget install --id Git.Git -e --source winget" : "brew install git";
    }

    private static String nodeInstallCommand() {
        return WINDOWS ? "winget install --id OpenJS.NodeJS.LTS -e --source winget" : "brew install node";
    }

    private static String pythonInstallCommand() {
        return WINDOWS ? "uv python install 3.12 --default" : "brew install python@3.12";
    }

    private static String uvInstallCommand() {
        return WINDOWS ? "winget install --id astral-sh.uv -e --source winget" : "brew install uv";
    }

    private static String firstLine(String value) {
        return value == null || value.isBlank() ? null : value.lines().findFirst().orElse(value).trim();
    }

    private static String joinVersions(String claudeVersion, String codexVersion) {
        return "Claude " + (claudeVersion == null ? "未装" : claudeVersion)
                + " · Codex " + (codexVersion == null ? "未装" : codexVersion);
    }

    private static String detail(ForgeEnvironmentCommandRunner.CommandResult first,
                                 ForgeEnvironmentCommandRunner.CommandResult second) {
        return blankToNull(String.join(System.lineSeparator(), first.output(), second.output()).trim());
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    /** 仅用于最低版本门禁的三段数字版本。 */
    private record Version(int major, int minor, int patch) {
        private static Version parse(String value) {
            Matcher matcher = VERSION.matcher(value == null ? "" : value);
            if (!matcher.find()) {
                return new Version(-1, -1, -1);
            }
            return new Version(number(matcher.group(1)), number(matcher.group(2)), number(matcher.group(3)));
        }

        private boolean atLeast(int requiredMajor, int requiredMinor, int requiredPatch) {
            if (major != requiredMajor) {
                return major > requiredMajor;
            }
            if (minor != requiredMinor) {
                return minor > requiredMinor;
            }
            return patch >= requiredPatch;
        }

        private static int number(String value) {
            return value == null ? 0 : Integer.parseInt(value);
        }
    }
}
