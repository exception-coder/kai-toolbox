package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.SidecarEngineVersionView;
import com.exceptioncoder.toolbox.claudechat.api.dto.SidecarVersionView;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

/**
 * sidecar 内置 npm 对话引擎运行包的版本自检服务；Antigravity 使用外部 agy 运行时。
 * 本地版本确定性读取，只有用户显式检查时才并行访问 npm registry。
 */
@Slf4j
@Service
public class SidecarVersionService {

    private static final String CLAUDE_PACKAGE = "@anthropic-ai/claude-agent-sdk";
    private static final List<EngineDefinition> ENGINES = List.of(
            new EngineDefinition("claude", "Claude Code", CLAUDE_PACKAGE, true),
            new EngineDefinition("codex", "Codex", "@openai/codex-sdk", false),
            new EngineDefinition("opencode", "OpenCode", "@opencode-ai/sdk", false)
    );
    private static final String REGISTRY_BASE = "https://registry.npmjs.org/";
    private static final Duration NETWORK_TIMEOUT = Duration.ofSeconds(6);
    private static final long CLI_VERSION_TIMEOUT_MS = 8_000;

    private final SidecarProcessRegistry registry;
    private final ObjectMapper mapper;

    /** 捆绑 CLI 版本的缓存：跑一次子进程才拿得到，而它只随已装 SDK 版本变化。 */
    private volatile String cachedCliFor;
    private volatile String cachedCliVersion;

    public SidecarVersionService(SidecarProcessRegistry registry, ObjectMapper mapper) {
        this.registry = registry;
        this.mapper = mapper;
    }

    /**
     * 读版本状态。
     *
     * @param checkLatest 是否联网查 npm 最新版（较慢，按需）
     */
    public SidecarVersionView read(boolean checkLatest) {
        Path dir = registry.sidecarDir();
        Path manifest = dir.resolve("package.json");
        if (!Files.isRegularFile(manifest)) {
            return SidecarVersionView.error("未找到 sidecar 的 package.json：" + manifest.toAbsolutePath());
        }
        JsonNode dependencies;
        try {
            dependencies = mapper.readTree(manifest.toFile()).path("dependencies");
        } catch (Exception e) {
            log.warn("[claude-chat] 读取 sidecar package.json 失败 path={}", manifest, e);
            return SidecarVersionView.error("读取 sidecar package.json 失败：" + e.getMessage());
        }
        Map<String, String> latestVersions = checkLatest ? fetchLatestVersions() : Map.of();
        List<SidecarEngineVersionView> engines = ENGINES.stream()
                .map(definition -> readEngine(definition, dependencies, dir, latestVersions))
                .toList();
        SidecarEngineVersionView claude = engines.get(0);
        boolean outdated = engines.stream().anyMatch(SidecarEngineVersionView::outdated);
        return new SidecarVersionView(
                claude.declared(), claude.installed(), claude.cliVersion(), claude.latest(), outdated,
                upgradeCommand(), null, engines);
    }

    /** 升级命令：更新内置 npm 引擎运行包并重新构建，装完必须重启 sidecar 才生效。 */
    public String upgradeCommand() {
        String packages = ENGINES.stream()
                .map(engine -> engine.packageName() + "@latest")
                .reduce((left, right) -> left + " " + right)
                .orElse("");
        return "cd sidecar/claude-agent && npm i " + packages + " && npm run build";
    }

    /** 读取单个引擎的声明、安装和可确认的捆绑 CLI 版本。 */
    private SidecarEngineVersionView readEngine(EngineDefinition definition, JsonNode dependencies,
                                                Path sidecarDir, Map<String, String> latestVersions) {
        String declared = blankToNull(dependencies.path(definition.packageName()).asText(null));
        String installed = readInstalledVersion(sidecarDir, definition.packageName());
        String cliVersion = definition.claudeCli() && installed != null ? readCliVersion(sidecarDir, installed) : null;
        String latest = latestVersions.get(definition.packageName());
        boolean outdated = installed != null && latest != null && compareSemver(installed, latest) < 0;
        String error = installed == null
                ? "未安装，请在 sidecar/claude-agent 执行 npm install"
                : null;
        return new SidecarEngineVersionView(
                definition.id(), definition.name(), definition.packageName(), declared, installed,
                cliVersion, latest, outdated, error);
    }

    /** 从 node_modules 读取运行时真正生效的包版本。 */
    private String readInstalledVersion(Path sidecarDir, String packageName) {
        Path pkg = sidecarDir.resolve("node_modules").resolve(Path.of(packageName)).resolve("package.json");
        if (!Files.isRegularFile(pkg)) {
            return null;
        }
        try {
            return blankToNull(mapper.readTree(pkg.toFile()).path("version").asText(null));
        } catch (Exception e) {
            log.debug("[claude-chat] 读取已装引擎包版本失败 package={}", packageName, e);
            return null;
        }
    }

    /**
     * 跑一次捆绑的 {@code claude --version}。SDK 版本号与 CLI 版本号只是约定对应、不是契约，
     * 所以问二进制本人，而不是从 SDK 版本推算。
     */
    private String readCliVersion(Path sidecarDir, String installedVersion) {
        if (installedVersion.equals(cachedCliFor) && cachedCliVersion != null) {
            return cachedCliVersion;
        }
        Path binary = findClaudeBinary(sidecarDir);
        if (binary == null) {
            return null;
        }
        Process p = null;
        try {
            p = new ProcessBuilder(binary.toString(), "--version").redirectErrorStream(true).start();
            String out;
            try (BufferedReader r = new BufferedReader(
                    new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                out = r.readLine();
            }
            if (!p.waitFor(CLI_VERSION_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
                p.destroyForcibly();
                return null;
            }
            String version = out == null ? null : blankToNull(out.trim());
            if (version != null) {
                cachedCliFor = installedVersion;
                cachedCliVersion = version;
            }
            return version;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            if (p != null) p.destroyForcibly();
            return null;
        } catch (Exception e) {
            log.debug("[claude-chat] 读取捆绑 CLI 版本失败", e);
            return null;
        }
    }

    /** 平台包名形如 claude-agent-sdk-win32-x64 / -linux-x64，按前缀找，避免把平台判断写死。 */
    private Path findClaudeBinary(Path sidecarDir) {
        Path scope = sidecarDir.resolve("node_modules").resolve("@anthropic-ai");
        if (!Files.isDirectory(scope)) {
            return null;
        }
        boolean windows = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
        String exe = windows ? "claude.exe" : "claude";
        try (Stream<Path> dirs = Files.list(scope)) {
            List<Path> candidates = dirs
                    .filter(Files::isDirectory)
                    .filter(d -> d.getFileName().toString().startsWith("claude-agent-sdk-"))
                    .map(d -> d.resolve(exe))
                    .filter(Files::isRegularFile)
                    .toList();
            return candidates.isEmpty() ? null : candidates.get(0);
        } catch (Exception e) {
            log.debug("[claude-chat] 定位 claude 二进制失败", e);
            return null;
        }
    }

    /** 并行查询 npm 包的最新版本，单个失败时保留其他结果。 */
    private Map<String, String> fetchLatestVersions() {
        try (HttpClient client = HttpClient.newBuilder().connectTimeout(NETWORK_TIMEOUT).build()) {
            Map<String, CompletableFuture<String>> requests = new LinkedHashMap<>(ENGINES.size());
            for (EngineDefinition engine : ENGINES) {
                HttpRequest request = HttpRequest.newBuilder(
                                URI.create(REGISTRY_BASE + engine.packageName() + "/latest"))
                        .timeout(NETWORK_TIMEOUT)
                        .header("Accept", "application/json")
                        .GET()
                        .build();
                CompletableFuture<String> version = client
                        .sendAsync(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
                        .thenApply(response -> parseLatestVersion(engine.packageName(), response))
                        .exceptionally(error -> {
                            log.debug("[claude-chat] 查询 npm 最新版失败 package={}", engine.packageName(), error);
                            return null;
                        });
                requests.put(engine.packageName(), version);
            }
            CompletableFuture.allOf(requests.values().toArray(CompletableFuture[]::new)).join();
            Map<String, String> versions = new LinkedHashMap<>(ENGINES.size());
            requests.forEach((packageName, future) -> {
                String version = future.join();
                if (version != null) {
                    versions.put(packageName, version);
                }
            });
            return versions;
        } catch (Exception e) {
            log.debug("[claude-chat] 查询 npm 最新版失败", e);
            return Map.of();
        }
    }

    /** 将 npm latest 响应解析为版本号，非成功响应按该包查询失败处理。 */
    private String parseLatestVersion(String packageName, HttpResponse<String> response) {
        if (response.statusCode() != 200) {
            log.debug("[claude-chat] 查询 npm 最新版返回 {} package={}", response.statusCode(), packageName);
            return null;
        }
        try {
            return blankToNull(mapper.readTree(response.body()).path("version").asText(null));
        } catch (Exception e) {
            log.debug("[claude-chat] 解析 npm 最新版失败 package={}", packageName, e);
            return null;
        }
    }

    /** 数字段逐位比较；非数字段（如 -beta.1）忽略，够用于「是否落后」这一个判断。 */
    static int compareSemver(String a, String b) {
        String[] left = a.split("[.+-]");
        String[] right = b.split("[.+-]");
        for (int i = 0; i < Math.max(left.length, right.length); i++) {
            int l = numberAt(left, i);
            int r = numberAt(right, i);
            if (l != r) {
                return Integer.compare(l, r);
            }
        }
        return 0;
    }

    private static int numberAt(String[] parts, int index) {
        if (index >= parts.length) {
            return 0;
        }
        try {
            return Integer.parseInt(parts[index]);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    /**
     * 对话引擎与其 sidecar 运行包的稳定映射。
     *
     * @param id          引擎标识
     * @param name        展示名称
     * @param packageName npm 包名
     * @param claudeCli   是否读取 Claude 捆绑 CLI
     */
    private record EngineDefinition(String id, String name, String packageName, boolean claudeCli) {
    }
}
