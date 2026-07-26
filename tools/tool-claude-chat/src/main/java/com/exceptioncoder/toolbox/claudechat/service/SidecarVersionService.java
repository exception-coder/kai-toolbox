package com.exceptioncoder.toolbox.claudechat.service;

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
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

/**
 * sidecar 所用 Claude Agent SDK 的版本自检。
 *
 * <p>为什么需要：SDK 版本在构建期就钉死在 package.json + lock 里，运行期没有任何可见性；而可选模型清单
 * 是运行期问捆绑的 claude 二进制要的（见 sidecar 的 supportedModels）。SDK 一旦落后，表现只是「模型少了几项」
 * ——静默降级、不报错，用户无从判断新模型为什么选不到。这里把版本摆到台面上。
 *
 * <p>确定性优先：已装/声明版本纯读文件；捆绑 CLI 版本跑一次 {@code claude --version}（结果按已装版本缓存）；
 * 只有「检查最新」才联网查 npm registry，且失败只返回原因、不影响其余字段。升级动作一律不代劳——
 * Agent SDK 会执行任意代码，自动跟版的风险大于收益，这里只给出可复制的命令。
 */
@Slf4j
@Service
public class SidecarVersionService {

    private static final String PACKAGE = "@anthropic-ai/claude-agent-sdk";
    private static final String REGISTRY = "https://registry.npmjs.org/" + PACKAGE + "/latest";
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
        String declared;
        try {
            declared = mapper.readTree(manifest.toFile()).path("dependencies").path(PACKAGE).asText(null);
        } catch (Exception e) {
            return SidecarVersionView.error("读取 sidecar package.json 失败：" + e.getMessage());
        }
        String installed = readInstalledVersion(dir);
        String cli = installed == null ? null : readCliVersion(dir, installed);
        String latest = checkLatest ? fetchLatestVersion() : null;
        boolean outdated = installed != null && latest != null && compareSemver(installed, latest) < 0;
        String error = installed == null
                ? "sidecar 未安装依赖（缺 node_modules/" + PACKAGE + "），请先在 sidecar/claude-agent 执行 npm install"
                : null;
        return new SidecarVersionView(declared, installed, cli, latest, outdated, upgradeCommand(), error);
    }

    /** 升级命令：装最新 SDK 再重新 tsc；改的是运行期依赖，装完必须重启 sidecar 才生效。 */
    public String upgradeCommand() {
        return "cd sidecar/claude-agent && npm i " + PACKAGE + "@latest && npm run build";
    }

    private String readInstalledVersion(Path sidecarDir) {
        Path pkg = sidecarDir.resolve("node_modules").resolve("@anthropic-ai")
                .resolve("claude-agent-sdk").resolve("package.json");
        if (!Files.isRegularFile(pkg)) {
            return null;
        }
        try {
            return blankToNull(mapper.readTree(pkg.toFile()).path("version").asText(null));
        } catch (Exception e) {
            log.debug("[claude-chat] 读取已装 SDK 版本失败：{}", e.getMessage());
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
            log.debug("[claude-chat] 读取捆绑 CLI 版本失败：{}", e.getMessage());
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
            log.debug("[claude-chat] 定位 claude 二进制失败：{}", e.getMessage());
            return null;
        }
    }

    /** 查 npm registry 上的最新版本。失败返回 null（调用方据此展示「查不到」，不影响本地字段）。 */
    private String fetchLatestVersion() {
        try (HttpClient client = HttpClient.newBuilder().connectTimeout(NETWORK_TIMEOUT).build()) {
            HttpRequest req = HttpRequest.newBuilder(URI.create(REGISTRY))
                    .timeout(NETWORK_TIMEOUT)
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (resp.statusCode() != 200) {
                log.debug("[claude-chat] 查询 npm 最新版返回 {}", resp.statusCode());
                return null;
            }
            JsonNode node = mapper.readTree(resp.body());
            return blankToNull(node.path("version").asText(null));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        } catch (Exception e) {
            log.debug("[claude-chat] 查询 npm 最新版失败：{}", e.getMessage());
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
}
