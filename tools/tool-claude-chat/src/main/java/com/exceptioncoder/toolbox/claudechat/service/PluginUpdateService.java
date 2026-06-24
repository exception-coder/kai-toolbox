package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.PluginStatusView;
import com.exceptioncoder.toolbox.claudechat.api.dto.PluginStatusView.EngineStatus;
import com.exceptioncoder.toolbox.claudechat.api.dto.PluginVersionView;
import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
import com.exceptioncoder.toolbox.claudechat.config.PluginUpdateProperties;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
    private final SseEmitterRegistry sse;
    private final ObjectMapper mapper;

    public PluginUpdateService(PluginUpdateProperties props, ClaudeChatProperties chatProps,
                               SseEmitterRegistry sse, ObjectMapper mapper) {
        this.props = props;
        this.chatProps = chatProps;
        this.sse = sse;
        this.mapper = mapper;
    }

    // ===== 版本检测 =====

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
    public List<PluginVersionView> readInstalledPlugins() {
        List<PluginVersionView> out = new ArrayList<>();
        try {
            Path home = Path.of(System.getProperty("user.home"));
            Path installedFile = home.resolve(".claude/plugins/installed_plugins.json");
            if (!Files.exists(installedFile)) {
                return out;
            }
            JsonNode plugins = mapper.readTree(installedFile.toFile()).path("plugins");
            if (!plugins.isObject()) {
                return out;
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
                String available = readMarketplaceVersion(home, marketplace, name);
                out.add(new PluginVersionView(name, marketplace, installed, available));
            }
            out.sort(Comparator.comparing(PluginVersionView::name, String.CASE_INSENSITIVE_ORDER));
        } catch (Exception ex) {
            log.debug("读取已安装插件清单失败：{}", ex.getMessage());
        }
        return out;
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

    /**
     * 在虚拟线程顺序跑 Claude 2 条 + Codex 2 条命令,经 SSE(key=taskId)实时推流。
     * emitter 由调用方(controller)先 create 并返回给 Spring 挂上 HTTP;此处仅启动 worker,
     * 开头小睡确保 SSE 连接已建立再发首条,避免早发事件丢失。
     */
    public void startUpdate(String taskId) {
        Thread.ofVirtual().name("plugin-update-" + taskId).start(() -> {
            List<Map<String, Object>> results = new ArrayList<>();
            try {
                Thread.sleep(150); // 等 SSE HTTP 挂上
                String mk = props.getMarketplace();
                String selector = props.getPluginName() + "@" + mk;
                List<String> claude = List.of(props.getClaudeBin(), "plugin");
                results.add(runStep(taskId, "claude", "marketplace-update",
                        concat(claude, "marketplace", "update", mk)));
                results.add(runStep(taskId, "claude", "install",
                        concat(claude, "install", selector)));
                List<String> codex = new ArrayList<>(codexParts());
                codex.add("plugin");
                results.add(runStep(taskId, "codex", "marketplace-upgrade",
                        concat(codex, "marketplace", "upgrade", mk)));
                results.add(runStep(taskId, "codex", "add",
                        concat(codex, "add", selector)));
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
        sse.publish(taskId, "message", Map.of("type", "line", "engine", engine, "step", step,
                "text", "$ " + String.join(" ", parts)));
        int exit;
        try {
            Process p = new ProcessBuilder(wrap(parts)).redirectErrorStream(true).start();
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
        Process p = new ProcessBuilder(wrap(parts)).redirectErrorStream(true).start();
        StringBuilder out = new StringBuilder();
        try (BufferedReader br = new BufferedReader(
                new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) out.append(line).append('\n');
        }
        int exit = p.waitFor(props.getCommandTimeoutMs(), TimeUnit.MILLISECONDS)
                ? p.exitValue() : forceKill(p);
        return new CommandResult(exit, out.toString());
    }

    private static int forceKill(Process p) {
        p.destroyForcibly();
        return -1;
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

    /** Codex 调用命令:配置优先,否则 nodeCommand + sidecar 自带 codex.js。 */
    private List<String> codexParts() {
        String configured = props.getCodexCmd();
        if (configured != null && !configured.isBlank()) {
            return List.of(configured.trim().split("\\s+"));
        }
        Path codexJs = Path.of(chatProps.getSidecarDir(), "node_modules", "@openai", "codex", "bin", "codex.js")
                .toAbsolutePath();
        return List.of(chatProps.getNodeCommand(), codexJs.toString());
    }

    private static List<String> concat(List<String> base, String... more) {
        List<String> r = new ArrayList<>(base);
        for (String m : more) r.add(m);
        return r;
    }

    private record CommandResult(int exitCode, String output) {}
}
