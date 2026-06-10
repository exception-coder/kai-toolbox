package com.exceptioncoder.toolbox.browserrequest.config;

import com.exceptioncoder.toolbox.browserrequest.domain.FlowAction;
import com.exceptioncoder.toolbox.browserrequest.domain.FlowRunResult;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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

    /** 全局默认是否用 undetected-node 引擎（新建会话未显式指定时的回退）。 */
    public boolean enabledByDefault() {
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
    void startIfDefault() {
        // 全局默认就是 node 引擎时，提前拉起；否则懒启动（首个 node 会话打开时再起）。
        if (enabledByDefault() && props.getSidecar().isAutoStart()) {
            ensureRunning();
        }
    }

    /**
     * 确保 sidecar 进程已启动并就绪。幂等、线程安全：已就绪则直接返回；否则拉起进程并健康轮询。
     * 供「按会话选引擎」下，首个 node 会话打开时懒启动。auto-start=false 时假定外部已起，仅探活。
     */
    public synchronized void ensureRunning() {
        if (ready && process != null && process.isAlive()) return;
        if (pingHealth()) { ready = true; return; }          // 外部已起 / 上次起的还活着
        BrowserRequestProperties.Sidecar cfg = props.getSidecar();
        if (!cfg.isAutoStart()) {
            ready = pingHealth();
            if (!ready) throw new IllegalStateException("sidecar 未启动且 auto-start=false，无法连接 " + base());
            return;
        }
        try {
            File dir = new File(cfg.getDir()).getAbsoluteFile();
            if (!new File(dir, "server.js").exists()) {
                throw new IllegalStateException("找不到 sidecar：" + dir
                        + "/server.js（确认 toolbox.browser-request.sidecar.dir，并已 npm install + npm run install-browser）");
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
            if (!ready) throw new IllegalStateException("sidecar 启动后 " + cfg.getStartupTimeoutMs()
                    + "ms 内未就绪，见 undetected-browser-sidecar.log");
        } catch (IllegalStateException ise) {
            throw ise;
        } catch (Exception e) {
            throw new IllegalStateException("sidecar 启动失败：" + e.getMessage(), e);
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
        ensureRunning();   // 懒启动：首个 node 会话打开时拉起 sidecar
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
        bestEffort("/sessions/" + id + "/clear");
    }

    public void close(String id) {
        bestEffort("/sessions/" + id + "/close");
    }

    /** close/clear 容错：sidecar 没起/连不上时无需报错（本就没东西可关）。 */
    private void bestEffort(String path) {
        try { post(path, "{}", Duration.ofSeconds(20)); }
        catch (Exception e) { log.debug("[undetected-browser] {} 忽略: {}", path, e.getMessage()); }
    }

    /** 当前页面截图（JPEG 字节）。供「实时画面」。 */
    public byte[] screenshot(String id) {
        try {
            HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(base() + "/sessions/" + id + "/screenshot"))
                    .timeout(Duration.ofSeconds(15)).GET();
            String token = props.getSidecar().getToken();
            if (token != null && !token.isBlank()) b.header("X-Sidecar-Token", token);
            HttpResponse<byte[]> r = http.send(b.build(), HttpResponse.BodyHandlers.ofByteArray());
            if (r.statusCode() != 200) throw new RuntimeException("screenshot HTTP " + r.statusCode());
            return r.body();
        } catch (RuntimeException re) {
            throw re;
        } catch (Exception e) {
            throw new RuntimeException("sidecar 截图失败: " + e.getMessage(), e);
        }
    }

    /** 归一化坐标点击（fx,fy ∈ [0,1]）。供「实时画面」远程点触。 */
    public void click(String id, double fx, double fy) {
        post("/sessions/" + id + "/click", "{\"fx\":" + fx + ",\"fy\":" + fy + "}", Duration.ofSeconds(10));
    }

    public void scroll(String id, double dy) {
        post("/sessions/" + id + "/scroll", "{\"dy\":" + dy + "}", Duration.ofSeconds(10));
    }

    public void type(String id, String text, String key) {
        StringBuilder sb = new StringBuilder("{");
        if (text != null) sb.append("\"text\":").append(jsonStr(text));
        if (key != null) { if (text != null) sb.append(','); sb.append("\"key\":").append(jsonStr(key)); }
        sb.append('}');
        post("/sessions/" + id + "/type", sb.toString(), Duration.ofSeconds(10));
    }

    /** AI 用例：让 sidecar 按选择器确定性执行动作脚本，返回逐步结果 + 失败现场。 */
    public FlowRunResult execActions(String id, List<FlowAction> steps, int defaultTimeoutMs) {
        ensureRunning();
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("steps", steps);
            body.put("defaultTimeoutMs", defaultTimeoutMs);
            String json = mapper.writeValueAsString(body);
            HttpResponse<String> r = send("POST", "/sessions/" + id + "/exec", json, Duration.ofSeconds(180));
            if (r.statusCode() >= 300) {
                throw new RuntimeException("sidecar exec -> HTTP " + r.statusCode() + " " + r.body());
            }
            return mapper.readValue(r.body(), FlowRunResult.class);
        } catch (RuntimeException re) {
            throw re;
        } catch (Exception e) {
            throw new RuntimeException("sidecar exec 失败: " + e.getMessage(), e);
        }
    }

    /** AI 用例：抓当前页面现场（URL/标题/截断 body），供生成时给 LLM 真实 DOM。 */
    public FlowRunResult.Snapshot snapshot(String id, int cap) {
        ensureRunning();
        try {
            HttpResponse<String> r = send("GET", "/sessions/" + id + "/snapshot", null, Duration.ofSeconds(30));
            if (r.statusCode() >= 300) {
                throw new RuntimeException("sidecar snapshot -> HTTP " + r.statusCode());
            }
            return mapper.readValue(r.body(), FlowRunResult.Snapshot.class);
        } catch (RuntimeException re) {
            throw re;
        } catch (Exception e) {
            throw new RuntimeException("sidecar snapshot 失败: " + e.getMessage(), e);
        }
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
