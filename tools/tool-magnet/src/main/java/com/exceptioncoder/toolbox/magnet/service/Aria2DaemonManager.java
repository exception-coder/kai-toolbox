package com.exceptioncoder.toolbox.magnet.service;

import com.exceptioncoder.toolbox.magnet.config.MagnetProperties;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 启停本机 aria2c 进程。
 *
 * <h3>失败容忍</h3>
 * aria2 未安装时不阻塞 Spring 启动，模块标记为不可用，控制器返回 503。
 */
@Component
@Configuration
@EnableConfigurationProperties(MagnetProperties.class)
public class Aria2DaemonManager {

    private static final Logger log = LoggerFactory.getLogger(Aria2DaemonManager.class);

    private final MagnetProperties props;
    private final Aria2RpcClient rpc;
    private final String dataDir;

    private volatile Process process;
    private final AtomicBoolean ready = new AtomicBoolean(false);
    private volatile String lastError;

    public Aria2DaemonManager(MagnetProperties props,
                              Aria2RpcClient rpc,
                              @Value("${toolbox.data-dir}") String dataDir) {
        this.props = props;
        this.rpc = rpc;
        this.dataDir = dataDir;
    }

    public boolean isReady() { return ready.get(); }
    public String lastError() { return lastError; }

    @PostConstruct
    public void start() {
        if (!props.isEnabled()) {
            log.info("toolbox.magnet.enabled=false, 跳过 aria2 daemon 启动");
            return;
        }
        try {
            startInternal();
        } catch (Exception e) {
            lastError = e.getMessage();
            log.warn("aria2 daemon 启动失败：{}（模块降级为不可用，可通过 /api/magnet/health 查询原因）", e.toString());
        }
    }

    private void startInternal() throws IOException {
        String binary = resolveBinary();

        String secret = props.getRpcSecret();
        if (secret == null || secret.isBlank()) {
            byte[] buf = new byte[24];
            new SecureRandom().nextBytes(buf);
            secret = Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
        }

        Path saveDir = Paths.get(defaultSavePath());
        Files.createDirectories(saveDir);
        Path sessionFile = Paths.get(resolveSessionFile());
        Files.createDirectories(sessionFile.getParent());
        if (!Files.exists(sessionFile)) {
            Files.writeString(sessionFile, "", StandardCharsets.UTF_8);
        }

        List<String> cmd = new ArrayList<>();
        cmd.add(binary);
        cmd.add("--enable-rpc=true");
        cmd.add("--rpc-listen-all=false");
        cmd.add("--rpc-listen-port=" + props.getRpcPort());
        cmd.add("--rpc-secret=" + secret);
        cmd.add("--dir=" + saveDir);
        cmd.add("--max-concurrent-downloads=" + props.getMaxConcurrentDownloads());
        cmd.add("--max-connection-per-server=" + props.getMaxConnectionsPerServer());
        cmd.add("--continue=true");
        cmd.add("--enable-dht=" + props.isEnableDht());
        cmd.add("--enable-dht6=false");
        cmd.add("--bt-enable-lpd=" + props.isEnableLpd());
        cmd.add("--bt-metadata-only=" + props.isBtMetadataOnly());
        cmd.add("--bt-save-metadata=" + props.isBtSaveMetadata());
        cmd.add("--seed-time=" + props.getSeedTimeSeconds());
        cmd.add("--follow-torrent=true");
        cmd.add("--listen-port=" + props.getBtListenPort());
        cmd.add("--max-overall-upload-limit=" + props.getMaxUploadLimitBps());
        cmd.add("--save-session=" + sessionFile);
        cmd.add("--input-file=" + sessionFile);
        cmd.add("--save-session-interval=30");
        cmd.add("--auto-save-interval=30");

        // DHT 路由表持久化：第一次启动找节点慢，存盘后秒接入
        Path dhtFile = Paths.get(resolveDhtFile());
        Files.createDirectories(dhtFile.getParent());
        if (!Files.exists(dhtFile)) {
            Files.writeString(dhtFile, "", StandardCharsets.UTF_8);
        }
        cmd.add("--dht-file-path=" + dhtFile);

        // 自定义 DHT 引导节点（aria2 默认值在国内访问差）
        for (String entry : props.getDhtEntryPoints()) {
            if (entry != null && !entry.isBlank()) cmd.add("--dht-entry-point=" + entry.trim());
        }

        // 兜底 tracker 列表
        if (!props.getTrackers().isEmpty()) {
            String trackerCsv = String.join(",", props.getTrackers());
            cmd.add("--bt-tracker=" + trackerCsv);
        }

        if (props.getProxy() != null && !props.getProxy().isBlank()) {
            String proxyUrl = props.getProxy().trim();
            cmd.add("--all-proxy=" + proxyUrl);
            log.info("aria2 走代理：{}（仅 HTTP/HTTPS 流量；UDP tracker / DHT / peer wire 仍直连）", proxyUrl);
        }

        cmd.add("--console-log-level=warn");
        cmd.add("--summary-interval=0");
        cmd.add("--check-certificate=true");

        log.info("启动 aria2 daemon: {} (RPC :{})", binary, props.getRpcPort());
        ProcessBuilder pb = new ProcessBuilder(cmd).redirectErrorStream(true);
        this.process = pb.start();

        // 后台抽干 aria2 子进程的 stdout/stderr：管道缓冲区写满会反压阻塞 aria2 主循环，
        // 即使我们不关心日志也必须持续消费。daemon 线程随 JVM 退出。
        Thread reader = new Thread(() -> drainStream(process), "aria2-stdout");
        reader.setDaemon(true);
        reader.start();

        rpc.setEffectiveSecret(secret);
        if (!waitForReady()) {
            throw new IOException("aria2 启动超时（>" + props.getStartupTimeoutMs() + "ms 仍未响应 RPC）");
        }
        ready.set(true);
        log.info("aria2 daemon 就绪");
    }

    private String resolveBinary() throws IOException {
        String binary = firstNonBlank(
                System.getProperty("TOOLBOX_ARIA2_BINARY"),
                System.getenv("TOOLBOX_ARIA2_BINARY"),
                props.getBinary());
        try {
            Process p = new ProcessBuilder(binary, "--version").redirectErrorStream(true).start();
            if (!p.waitFor(3, java.util.concurrent.TimeUnit.SECONDS)) {
                p.destroyForcibly();
                throw new IOException("aria2c --version 3s 内未返回");
            }
            if (p.exitValue() != 0) {
                throw new IOException("aria2c --version 退出码 " + p.exitValue());
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("aria2c --version 被中断", e);
        }
        return binary;
    }

    // aria2 没有"RPC 就绪"事件，只能轮询 ping；200ms 间隔人感不到延迟，CPU 也几乎无负担
    @SuppressWarnings("BusyWait")
    private boolean waitForReady() {
        long deadline = System.currentTimeMillis() + props.getStartupTimeoutMs();
        while (System.currentTimeMillis() < deadline) {
            if (process != null && !process.isAlive()) {
                log.warn("aria2 进程在启动期就退出，exitValue={}", process.exitValue());
                return false;
            }
            if (rpc.ping()) return true;
            try { Thread.sleep(200); }
            catch (InterruptedException ie) { Thread.currentThread().interrupt(); return false; }
        }
        return false;
    }

    private void drainStream(Process p) {
        try (var in = p.getInputStream();
             var reader = new java.io.BufferedReader(new java.io.InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                // aria2 console 输出夹大量空行/纯空白行作为视觉分隔，对日志无意义，过滤掉
                if (line.isBlank()) continue;
                log.debug("[aria2] {}", line);
            }
        } catch (IOException ignored) {
            // process 退出时正常
        }
    }

    @PreDestroy
    public void stop() {
        ready.set(false);
        Process p = this.process;
        if (p == null || !p.isAlive()) return;
        try {
            try { rpc.shutdown(); }
            catch (IOException e) { log.debug("aria2 shutdown RPC failed: {}", e.getMessage()); }
            if (!p.waitFor(props.getStopGraceMs(), java.util.concurrent.TimeUnit.MILLISECONDS)) {
                log.info("aria2 优雅退出超时，发送 SIGTERM");
                p.destroy();
                if (!p.waitFor(props.getStopGraceMs(), java.util.concurrent.TimeUnit.MILLISECONDS)) {
                    log.warn("aria2 SIGTERM 超时，SIGKILL");
                    p.destroyForcibly();
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            p.destroyForcibly();
        }
    }

    private String defaultSavePath() {
        String p = props.getDefaultSavePath();
        if (p != null && !p.isBlank()) return p;
        return System.getProperty("user.home").replace("\\", "/") + "/Downloads/kai-toolbox-magnet";
    }

    private String resolveSessionFile() {
        String s = props.getSessionFile();
        if (s != null && !s.isBlank()) return s;
        return (dataDir.replace("\\", "/")) + "/aria2/session.txt";
    }

    private String resolveDhtFile() {
        String s = props.getDhtFilePath();
        if (s != null && !s.isBlank()) return s;
        return (dataDir.replace("\\", "/")) + "/aria2/dht.dat";
    }

    private static String firstNonBlank(String... vals) {
        for (String v : vals) {
            if (v != null && !v.isBlank()) return v;
        }
        return null;
    }

    public void requireReady() {
        if (!ready.get()) {
            throw new MagnetUnavailableException(
                    "aria2 daemon 未就绪：" + (lastError == null ? "未启动" : lastError));
        }
    }
}
