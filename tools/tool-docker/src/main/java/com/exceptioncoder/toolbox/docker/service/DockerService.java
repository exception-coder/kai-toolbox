package com.exceptioncoder.toolbox.docker.service;

import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.exceptioncoder.toolbox.docker.api.dto.ComposeActionResponse;
import com.exceptioncoder.toolbox.docker.api.dto.ComposeFileView;
import com.exceptioncoder.toolbox.docker.api.dto.ContainerStatsResponse;
import com.exceptioncoder.toolbox.docker.api.dto.ContainerStatsView;
import com.exceptioncoder.toolbox.docker.api.dto.ContainerView;
import com.exceptioncoder.toolbox.docker.api.dto.DockerAppRequest;
import com.exceptioncoder.toolbox.docker.api.dto.FileContentView;
import com.exceptioncoder.toolbox.docker.api.dto.FileWriteResponse;
import com.exceptioncoder.toolbox.docker.api.dto.LogTailResponse;
import com.exceptioncoder.toolbox.docker.api.dto.ScannedAppView;
import com.exceptioncoder.toolbox.docker.domain.ComposeAction;
import com.exceptioncoder.toolbox.docker.domain.ComposeOptions;
import com.exceptioncoder.toolbox.docker.domain.ContainerAction;
import com.exceptioncoder.toolbox.docker.domain.DockerApp;
import com.exceptioncoder.toolbox.docker.repository.DockerAppRepository;
import com.exceptioncoder.toolbox.hosts.domain.Host;
import com.exceptioncoder.toolbox.hosts.service.HostSshExec;
import com.exceptioncoder.toolbox.hosts.service.HostSshSessions;
import com.exceptioncoder.toolbox.hosts.service.HostsService;
import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.Session;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.NoSuchFileException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Docker 工具的远端命令编排中心。所有方法体（除 followLogs）必须在 finally 关 session。 */
@Service
public class DockerService {

    private static final Logger log = LoggerFactory.getLogger(DockerService.class);
    private static final int MAX_FILE_SIZE = 256 * 1024;
    private static final int MAX_LOG_OUTPUT_BYTES = 1024 * 1024;

    private final DockerAppRepository repo;
    private final HostsService hosts;
    private final HostSshSessions sessions;
    private final DockerCommandBuilder cmd;
    private final DockerComposeScanner scanner;
    private final DockerPsParser parser;
    private final ContainerCache cache;
    private final SseEmitterRegistry sseRegistry;
    private final LogStreamRegistry logStreams;

    public DockerService(DockerAppRepository repo, HostsService hosts, HostSshSessions sessions,
                         DockerCommandBuilder cmd, DockerComposeScanner scanner, DockerPsParser parser,
                         ContainerCache cache, SseEmitterRegistry sseRegistry, LogStreamRegistry logStreams) {
        this.repo = repo;
        this.hosts = hosts;
        this.sessions = sessions;
        this.cmd = cmd;
        this.scanner = scanner;
        this.parser = parser;
        this.cache = cache;
        this.sseRegistry = sseRegistry;
        this.logStreams = logStreams;
    }

    /* ========== 应用 CRUD ========== */

    public List<DockerApp> listApps(String hostId) {
        hosts.findRequired(hostId); // 校验主机存在
        return repo.findAllByHost(hostId);
    }

    public DockerApp findApp(String appId) {
        return repo.findById(appId).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "docker app not found: " + appId));
    }

    public DockerApp createApp(String hostId, DockerAppRequest req) {
        Host host = hosts.findRequired(hostId);
        String baseDir = req.baseDir().trim();
        if (repo.existsByHostAndBaseDir(hostId, baseDir)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "duplicate: hostId=" + hostId + " baseDir=" + baseDir);
        }
        String composeFile = (req.composeFile() == null || req.composeFile().isBlank())
                ? "docker-compose.yml" : req.composeFile().trim();
        boolean skipValidate = Boolean.TRUE.equals(req.skipValidate());
        if (!skipValidate) {
            validateCompose(host, baseDir, composeFile);
        }
        long now = System.currentTimeMillis();
        DockerApp app = DockerApp.builder()
                .id(UUID.randomUUID().toString())
                .hostId(hostId)
                .name(req.name().trim())
                .baseDir(baseDir)
                .composeFile(composeFile)
                .note(blankToNull(req.note()))
                .createdAt(now)
                .updatedAt(now)
                .build();
        repo.insert(app);
        return app;
    }

    public DockerApp updateApp(String hostId, String appId, DockerAppRequest req) {
        DockerApp existing = findApp(appId);
        if (!existing.getHostId().equals(hostId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "app does not belong to host");
        }
        String newBaseDir = req.baseDir().trim();
        if (!newBaseDir.equals(existing.getBaseDir())
                && repo.existsByHostAndBaseDir(hostId, newBaseDir)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "duplicate baseDir");
        }
        existing.setName(req.name().trim());
        existing.setBaseDir(newBaseDir);
        existing.setComposeFile((req.composeFile() == null || req.composeFile().isBlank())
                ? "docker-compose.yml" : req.composeFile().trim());
        existing.setNote(blankToNull(req.note()));
        existing.setUpdatedAt(System.currentTimeMillis());
        repo.update(existing);
        return existing;
    }

    public void deleteApp(String hostId, String appId) {
        DockerApp existing = findApp(appId);
        if (!existing.getHostId().equals(hostId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "app does not belong to host");
        }
        repo.deleteById(appId);
    }

    private void validateCompose(Host host, String baseDir, String composeFile) {
        Session s = null;
        try {
            s = sessions.open(host);
            String composeBin = cmd.composeBin(host.getId(), s);
            HostSshExec.Result r = HostSshExec.run(s, cmd.composeConfigCheck(composeBin, baseDir, composeFile));
            if (!r.ok()) {
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "compose config invalid: " + (r.stdout().isBlank() ? r.stderr() : r.stdout()));
            }
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "compose validate failed: " + e.getMessage());
        } finally {
            disconnectQuietly(s);
        }
    }

    /* ========== 目录扫描 ========== */

    public List<ScannedAppView> scan(String hostId, String baseDir, int maxDepth) {
        Host host = hosts.findRequired(hostId);
        Session s = null;
        try {
            s = sessions.open(host);
            return scanner.scan(s, hostId, baseDir, maxDepth);
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("scan failed: " + e.getMessage(), e);
        } finally {
            disconnectQuietly(s);
        }
    }

    /* ========== 容器列表 / stats（含缓存） ========== */

    public List<ContainerView> listContainers(String hostId, String appId, boolean includeStopped, boolean noCache) {
        Host host = hosts.findRequired(hostId);
        String key = "containers:" + hostId + ":" + (appId == null ? "_" : appId) + ":" + includeStopped;
        if (noCache) {
            List<ContainerView> fresh = doListContainers(host, appId, includeStopped);
            cache.put(key, fresh);
            return fresh;
        }
        return cache.get(key, () -> doListContainers(host, appId, includeStopped));
    }

    private List<ContainerView> doListContainers(Host host, String appId, boolean includeStopped) {
        Session s = null;
        try {
            s = sessions.open(host);
            HostSshExec.Result r = HostSshExec.run(s, cmd.dockerPs(includeStopped));
            if (!r.ok()) throw new IllegalStateException("docker ps failed: " + r.stderr());

            // 建立 composeProject → appId 映射
            Map<String, String> projectToApp = new HashMap<>();
            for (DockerApp a : repo.findAllByHost(host.getId())) {
                projectToApp.put(lastSegment(a.getBaseDir()), a.getId());
            }
            List<ContainerView> all = parser.parsePs(r.stdout(), projectToApp);

            // 若指定 appId，过滤
            if (appId != null) {
                List<ContainerView> filtered = new ArrayList<>();
                for (ContainerView c : all) {
                    if (appId.equals(c.appId())) filtered.add(c);
                }
                return filtered;
            }
            return all;
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("list containers failed: " + e.getMessage(), e);
        } finally {
            disconnectQuietly(s);
        }
    }

    public ContainerStatsResponse stats(String hostId, boolean noCache) {
        Host host = hosts.findRequired(hostId);
        String key = "stats:" + hostId;
        if (noCache) {
            ContainerStatsResponse fresh = doStats(host);
            cache.put(key, fresh);
            return fresh;
        }
        return cache.get(key, () -> doStats(host));
    }

    private ContainerStatsResponse doStats(Host host) {
        Session s = null;
        try {
            s = sessions.open(host);
            HostSshExec.Result r = HostSshExec.run(s, cmd.dockerStats());
            if (!r.ok()) throw new IllegalStateException("docker stats failed: " + r.stderr());
            List<ContainerStatsView> items = parser.parseStats(r.stdout());
            return new ContainerStatsResponse(System.currentTimeMillis(), items);
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("stats failed: " + e.getMessage(), e);
        } finally {
            disconnectQuietly(s);
        }
    }

    /* ========== 容器动作 / compose 动作 ========== */

    public void containerAction(String hostId, String cid, ContainerAction action) {
        Host host = hosts.findRequired(hostId);
        if (!isSafeContainerId(cid)) {
            throw new IllegalArgumentException("invalid container id");
        }
        Session s = null;
        try {
            s = sessions.open(host);
            HostSshExec.Result r = HostSshExec.run(s, cmd.containerAction(action.cli(), cid));
            if (!r.ok()) {
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "docker " + action.cli() + " failed: " + (r.stderr().isBlank() ? r.stdout() : r.stderr()));
            }
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, e.getMessage());
        } finally {
            disconnectQuietly(s);
            cache.invalidateHost(hostId);
        }
    }

    public ComposeActionResponse composeAction(String hostId, String appId, ComposeAction action, ComposeOptions opts) {
        Host host = hosts.findRequired(hostId);
        DockerApp app = findApp(appId);
        if (!app.getHostId().equals(hostId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "app does not belong to host");
        }
        Session s = null;
        try {
            s = sessions.open(host);
            String composeBin = cmd.composeBin(hostId, s);
            String command = cmd.compose(composeBin, app.getBaseDir(), app.getComposeFile(), action, opts);
            long start = System.currentTimeMillis();
            HostSshExec.Result r = HostSshExec.run(s, command);
            long duration = System.currentTimeMillis() - start;
            return new ComposeActionResponse(r.exitCode(), r.stdout(), r.stderr(), duration);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, e.getMessage());
        } finally {
            disconnectQuietly(s);
            cache.invalidateHost(hostId);
        }
    }

    /* ========== 日志 ========== */

    public LogTailResponse tailLogs(String hostId, String cid, int tail, String since, boolean timestamps) {
        Host host = hosts.findRequired(hostId);
        if (!isSafeContainerId(cid)) {
            throw new IllegalArgumentException("invalid container id");
        }
        Session s = null;
        try {
            s = sessions.open(host);
            HostSshExec.Result r = HostSshExec.run(s, cmd.dockerLogs(cid, tail, since, timestamps, false));
            byte[] raw = r.stdout().getBytes(StandardCharsets.UTF_8);
            boolean truncated = raw.length > MAX_LOG_OUTPUT_BYTES;
            String body = truncated
                    ? new String(raw, 0, MAX_LOG_OUTPUT_BYTES, StandardCharsets.UTF_8)
                    : r.stdout();
            List<String> lines = new ArrayList<>();
            for (String l : body.split("\n")) {
                if (!l.isEmpty()) lines.add(l);
            }
            return new LogTailResponse(lines, truncated);
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("docker logs failed: " + e.getMessage(), e);
        } finally {
            disconnectQuietly(s);
        }
    }

    /**
     * 启动 SSE follow 流。streamId 由 controller 生成（用作 SseEmitterRegistry key + LogStreamRegistry key）。
     * controller 在调用前应已 create emitter 并挂好 onCompletion/onTimeout/onError → {@link #closeStream(String)}。
     */
    public void openLogStream(String hostId, String cid, int tail, String since, boolean timestamps,
                              SseEmitter emitter, String streamId) {
        Host host = hosts.findRequired(hostId);
        if (!isSafeContainerId(cid)) {
            throw new IllegalArgumentException("invalid container id");
        }
        Session session;
        try {
            session = sessions.open(host);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "ssh connect failed: " + e.getMessage());
        }
        try {
            emitter.send(SseEmitter.event().name("ready")
                    .data(Map.of("streamId", streamId)));
        } catch (Exception e) {
            try { session.disconnect(); } catch (Exception ignored) {}
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "sse send failed: " + e.getMessage());
        }
        final Session finalSession = session;
        try {
            HostSshStream stream = HostSshStream.open(finalSession,
                    cmd.dockerLogs(cid, tail, since, timestamps, true),
                    line -> sseRegistry.publish(streamId, "log",
                            Map.of("data", Base64.getEncoder().encodeToString(line.getBytes(StandardCharsets.UTF_8)))),
                    () -> {
                        sseRegistry.publish(streamId, "done", Map.of("exitCode", 0));
                        sseRegistry.complete(streamId);
                        logStreams.close(streamId);
                    });
            logStreams.register(streamId, stream);
        } catch (Exception e) {
            try { finalSession.disconnect(); } catch (Exception ignored) {}
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "open log stream failed: " + e.getMessage());
        }
    }

    public void closeStream(String streamId) {
        logStreams.close(streamId);
        sseRegistry.complete(streamId);
    }

    /* ========== 配置文件 ========== */

    public List<ComposeFileView> listFiles(String hostId, String appId) {
        Host host = hosts.findRequired(hostId);
        DockerApp app = findApp(appId);
        if (!app.getHostId().equals(hostId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "app does not belong to host");
        }
        Session s = null;
        try {
            s = sessions.open(host);
            HostSshExec.Result r = HostSshExec.run(s, cmd.listConfigFiles(app.getBaseDir()));
            List<ComposeFileView> out = new ArrayList<>();
            for (String line : r.stdout().split("\n")) {
                if (line.isBlank()) continue;
                String[] parts = line.split("\t");
                if (parts.length < 3) continue;
                String path = parts[0];
                long size = parseLong(parts[1]);
                long mtime = (long) (parseDouble(parts[2]) * 1000L);
                String name = lastSegment(path);
                out.add(new ComposeFileView(path, name, size, mtime));
            }
            return out;
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("list files failed: " + e.getMessage(), e);
        } finally {
            disconnectQuietly(s);
        }
    }

    public FileContentView readFile(String hostId, String appId, String path) throws NoSuchFileException {
        Host host = hosts.findRequired(hostId);
        DockerApp app = findApp(appId);
        if (!app.getHostId().equals(hostId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "app does not belong to host");
        }
        Session s = null;
        try {
            s = sessions.open(host);
            assertPathInsideBaseDir(s, app.getBaseDir(), path);
            // 大小检查
            HostSshExec.Result stat = HostSshExec.run(s, cmd.fileStat(path));
            if (!stat.ok()) throw new NoSuchFileException(path);
            String[] parts = stat.stdout().trim().split("\t");
            long size = parts.length > 0 ? parseLong(parts[0]) : 0;
            long mtime = parts.length > 1 ? parseLong(parts[1]) * 1000L : 0;
            if (size > MAX_FILE_SIZE) {
                throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,
                        "file too large: " + size + " bytes (max " + MAX_FILE_SIZE + ")");
            }
            HostSshExec.Result cat = HostSshExec.run(s, cmd.catFile(path));
            if (!cat.ok()) throw new NoSuchFileException(path);
            return new FileContentView(path, cat.stdout(), size, mtime);
        } catch (NoSuchFileException | ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("read file failed: " + e.getMessage(), e);
        } finally {
            disconnectQuietly(s);
        }
    }

    public FileWriteResponse writeFile(String hostId, String appId, String path, String content) {
        if (content == null) content = "";
        if (content.getBytes(StandardCharsets.UTF_8).length > MAX_FILE_SIZE) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,
                    "content too large (max " + MAX_FILE_SIZE + " bytes)");
        }
        Host host = hosts.findRequired(hostId);
        DockerApp app = findApp(appId);
        if (!app.getHostId().equals(hostId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "app does not belong to host");
        }
        Session s = null;
        try {
            s = sessions.open(host);
            assertPathInsideBaseDir(s, app.getBaseDir(), path);
            long ts = System.currentTimeMillis();
            String backupPath = path + ".bak." + ts;
            String tmpPath = path + ".tmp." + ts;
            // 备份（容忍原文件不存在）
            HostSshExec.run(s, "cp -- " + HostSshExec.singleQuote(path) + " "
                    + HostSshExec.singleQuote(backupPath) + " 2>/dev/null || true");
            // 写入临时文件
            writeRemoteFile(s, tmpPath, content);
            // 原子替换
            HostSshExec.Result mv = HostSshExec.run(s, "mv -- " + HostSshExec.singleQuote(tmpPath)
                    + " " + HostSshExec.singleQuote(path));
            if (!mv.ok()) {
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "mv failed: " + mv.stderr());
            }
            // 拉取最新 stat
            HostSshExec.Result stat = HostSshExec.run(s, cmd.fileStat(path));
            long size = 0, mtime = 0;
            if (stat.ok()) {
                String[] parts = stat.stdout().trim().split("\t");
                size = parts.length > 0 ? parseLong(parts[0]) : 0;
                mtime = parts.length > 1 ? parseLong(parts[1]) * 1000L : 0;
            }
            return new FileWriteResponse(path, backupPath, size, mtime);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("write file failed: " + e.getMessage(), e);
        } finally {
            disconnectQuietly(s);
        }
    }

    /* ========== 内部工具 ========== */

    private void assertPathInsideBaseDir(Session s, String baseDir, String path) throws Exception {
        HostSshExec.Result baseReal = HostSshExec.run(s, cmd.realpath(baseDir));
        if (!baseReal.ok()) {
            throw new IllegalStateException("baseDir realpath failed: " + baseReal.stderr());
        }
        HostSshExec.Result pathReal = HostSshExec.run(s, cmd.realpath(path));
        if (!pathReal.ok()) {
            throw new NoSuchFileException(path);
        }
        String baseAbs = baseReal.stdout().trim();
        String pathAbs = pathReal.stdout().trim();
        if (baseAbs.isBlank() || pathAbs.isBlank()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "path resolves to empty");
        }
        if (!baseAbs.endsWith("/")) baseAbs = baseAbs + "/";
        if (!(pathAbs + "/").startsWith(baseAbs)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "path outside baseDir: " + pathAbs);
        }
    }

    /** 通过 stdin 把内容写到远端文件（使用 `tee tmpFile > /dev/null`）。 */
    private void writeRemoteFile(Session s, String tmpPath, String content) throws Exception {
        ChannelExec channel = (ChannelExec) s.openChannel("exec");
        try {
            channel.setCommand("tee " + HostSshExec.singleQuote(tmpPath) + " > /dev/null");
            OutputStream out = channel.getOutputStream();
            channel.setErrStream(System.err, false);
            channel.connect();
            out.write(content.getBytes(StandardCharsets.UTF_8));
            out.flush();
            out.close();
            // 等待远端结束
            while (!channel.isClosed()) {
                Thread.sleep(30);
            }
            if (channel.getExitStatus() != 0) {
                throw new IllegalStateException("tee exit=" + channel.getExitStatus());
            }
        } finally {
            channel.disconnect();
        }
    }

    private static boolean isSafeContainerId(String cid) {
        return cid != null && cid.matches("[a-zA-Z0-9_.\\-]{1,128}");
    }

    private static void disconnectQuietly(Session s) {
        if (s != null) {
            try { s.disconnect(); } catch (Exception ignored) {}
        }
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }

    private static String lastSegment(String path) {
        if (path == null || path.isBlank()) return "";
        String p = path.endsWith("/") ? path.substring(0, path.length() - 1) : path;
        int i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
        return i >= 0 ? p.substring(i + 1) : p;
    }

    private static long parseLong(String s) {
        try { return Long.parseLong(s.trim()); } catch (Exception e) { return 0L; }
    }

    private static double parseDouble(String s) {
        try { return Double.parseDouble(s.trim()); } catch (Exception e) { return 0.0; }
    }
}
