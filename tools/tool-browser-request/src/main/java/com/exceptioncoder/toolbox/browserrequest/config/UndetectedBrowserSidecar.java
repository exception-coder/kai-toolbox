package com.exceptioncoder.toolbox.browserrequest.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.File;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * undetected-node 引擎桥接：管理 patchright sidecar 进程（node server.js）并通过本机 HTTP 调用它。
 *
 * <p>为什么浏览器控制必须全在 sidecar：标准 Playwright（含本工程 Java 版）会调 CDP {@code Runtime.enable}，
 * 被 BOSS zpAegis 这类商用反爬探测（实测 cdpConsoleDetected=true）后页面被潰成 about:blank。patchright
 * 规避了该调用。所以一旦走 undetected-node 引擎，Java 绝不用自带 Playwright 碰这个 session，全部转交 sidecar。
 *
 * <p>仅在 {@code toolbox.browser-request.engine=undetected-node} 时拉起进程；否则本 bean 空转（available=false）。
 */
@Slf4j
@Component
public class UndetectedBrowserSidecar {

    private final BrowserRequestProperties props;
    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    private volatile Process process;
    private volatile boolean ready = false;

    public UndetectedBrowserSidecar(BrowserRequestProperties props, ObjectMapper mapper) {
        this.props = props;
        this.mapper = mapper;
    }

    /** 当前是否启用 undetected-node 引擎。 */
    public boolean enabled() {
        return "undetected-node".equalsIgnoreCase(props.getEngine());
    }

    private String base() {
        return "http://127.0.0.1:" + props.getSidecar().getPort();
    }

    private Path dataDir() {
        String configured = props.getDataDir();
        return (configured == null || configured.isBlank())
                ? Paths.get(System.getProperty("user.home"), ".kai-toolbox", "browser-request")
                : Paths.get(configured);
    }

    @PostConstruct
    void startIfEnabled() {
        if (!enabled()) {
            log.info("[undetected-browser] 引擎=playwright-java，sidecar 不启动");
            return;
        }
        BrowserRequestProperties.Sidecar cfg = props.getSidecar();
        if (!cfg.isAutoStart()) {
            log.info("[undetected-browser] auto-start=false，假定 sidecar 已外部启动于 {}", base());
            ready = pingHealth();
            return;
        }
        try {
            File dir = new File(cfg.getDir()).getAbsoluteFile();
            if (!new File(dir, "server.js").exists()) {
                log.error("[undetected-browser] 找不到 sidecar：{}/server.js（请确认 toolbox.browser-request.sidecar.dir，"
                        + "并已执行 npm install + npm run install-browser）", dir);
                return;
            }
            ProcessBuilder pb = new ProcessBuilder(cfg.getNodePath(), "server.js");
            pb.directory(dir);
            pb.redirectErrorStream(true);
            pb.redirectOutput(dataDir().resolve("undetected-browser-sidecar.log").toFile());
            var env = pb.environment();
            env.put("BROWSER_SIDECAR_PORT", String.valueOf(cfg.getPort()));
            env.put("BROWSER_SIDECAR_CHANNEL", cfg.getChannel() == null ? "" : cfg.getChannel());
            env.put("BROWSER_SIDECAR_HEADLESS", String.valueOf(cfg.isHeadless()));
            env.put("BROWSER_SIDECAR_DATA_DIR", dataDir().toAbsolutePath().toString());
            if (cfg.getToken() != null && !cfg.getToken().isBlank()) {
                env.put("BROWSER_SIDECAR_TOKEN", cfg.getToken());
            }
            process = pb.start();
            log.info("[undetected-browser] sidecar 已启动 pid={} dir={} port={} channel={} headless={}",
                    process.pid(), dir, cfg.getPort(), cfg.getChannel(), cfg.isHeadless());
            waitReady(cfg.getStartupTimeoutMs());
        } catch (Exception e) {
            log.error("[undetected-browser] sidecar 启动失败：{}", e.getMessage(), e);
        }
    }

    private void waitReady(long timeoutMs) {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            if (process != null && !process.isAlive()) {
                log.error("[undetected-browser] sidecar 进程已退出（exit={}），见日志 undetected-browser-sidecar.log",
                        process.exitValue());
                return;
            }
            if (pingHealth()) {
                ready = true;
                log.info("[undetected-browser] sidecar 就绪 {}", base());
                return;
            }
            try { Thread.sleep(500); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); return; }
        }
        log.error("[undetected-browser] sidecar {}ms 内未就绪", timeoutMs);
    }

    private boolean pingHealth() {
        try {
            HttpResponse<String> r = send("GET", "/health", null, Duration.ofSeconds(3));
            return r.statusCode() == 200;
        } catch (Exception e) {
            return false;
        }
    }

    // ===== 会话生命周期（供 BrowserRequestService 在 node 引擎下调用） =====

    public void openSession(String id, String url) {
        post("/sessions/" + id + "/open", "{\"url\":" + jsonStr(url) + "}", Duration.ofSeconds(60));
    }

    public List<String> listPageUrls(String id) {
        try {
            HttpResponse<String> r = send("GET", "/sessions/" + id + "/pages", null, Duration.ofSeconds(10));
            JsonNode n = mapper.readTree(r.body());
            List<String> out = new ArrayList<>();
            if (n.has("pages") && n.get("pages").isArray()) {
                n.get("pages").forEach(p -> out.add(p.asText()));
            }
            if (out.isEmpty() && n.has("note")) {
                out.add("(" + n.get("note").asText() + ")");
            }
            return out;
        } catch (Exception e) {
            return List.of("(sidecar 读取失败: " + e.getMessage() + ")");
        }
    }

    /** 让 sidecar 把登录态导出到指定路径（与 Java 端 storageStatePath 对齐）。 */
    public void save(String id, Path path) {
        post("/sessions/" + id + "/save",
                "{\"path\":" + jsonStr(path.toAbsolutePath().toString()) + "}", Duration.ofSeconds(20));
    }

    public void clear(String id) {
        post("/sessions/" + id + "/clear", "{}", Duration.ofSeconds(20));
    }

    public void close(String id) {
        post("/sessions/" + id + "/close", "{}", Duration.ofSeconds(20));
    }

    public boolean isOpen(String id) {
        try {
            HttpResponse<String> r = send("GET", "/sessions/" + id + "/pages", null, Duration.ofSeconds(5));
            JsonNode n = mapper.readTree(r.body());
            return n.path("tracked").asBoolean(false);
        } catch (Exception e) {
            return false;
        }
    }

    // ===== 内部 HTTP =====

    private void post(String path, String body, Duration timeout) {
        try {
            HttpResponse<String> r = send("POST", path, body, timeout);
            if (r.statusCode() >= 300) {
                throw new RuntimeException("sidecar " + path + " -> HTTP " + r.statusCode() + " " + r.body());
            }
        } catch (RuntimeException re) {
            throw re;
        } catch (Exception e) {
            throw new RuntimeException("sidecar 调用失败 " + path + ": " + e.getMessage(), e);
        }
    }

    private HttpResponse<String> send(String method, String path, String body, Duration timeout) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(base() + path)).timeout(timeout);
        String token = props.getSidecar().getToken();
        if (token != null && !token.isBlank()) b.header("X-Sidecar-Token", token);
        if ("POST".equals(method)) {
            b.header("Content-Type", "application/json")
             .POST(HttpRequest.BodyPublishers.ofString(body == null ? "{}" : body, StandardCharsets.UTF_8));
        } else {
            b.GET();
        }
        return http.send(b.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    }

    private static String jsonStr(String s) {
        if (s == null) return "\"\"";
        StringBuilder sb = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> sb.append(c);
            }
        }
        return sb.append('"').toString();
    }

    @PreDestroy
    void stop() {
        if (process != null && process.isAlive()) {
            log.info("[undetected-browser] 关闭 sidecar pid={}", process.pid());
            process.destroy();
            try {
                if (!process.waitFor(5, java.util.concurrent.TimeUnit.SECONDS)) process.destroyForcibly();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                process.destroyForcibly();
            }
        }
    }
}
