package com.exceptioncoder.toolbox.magnet.service;

import com.exceptioncoder.toolbox.magnet.domain.MagnetTaskState;
import com.exceptioncoder.toolbox.magnet.domain.MagnetTaskView;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.ResponseStatus;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 把 controller 的请求翻译成 aria2 RPC 调用。
 *
 * <h3>关键路径：addUri 提速</h3>
 * 用户贴磁力时,先并发查公共种子缓存站(itorrents 等)。命中就拿 .torrent 字节走
 * {@code aria2.addTorrent},跳过整个 DHT metadata 阶段(原本要 30-120 秒)。
 * 缓存全 miss 才退回到原始的 {@code aria2.addUri} 磁力流程。
 */
@Service
public class MagnetTaskService {

    private static final Logger log = LoggerFactory.getLogger(MagnetTaskService.class);

    private final Aria2DaemonManager daemon;
    private final Aria2RpcClient rpc;
    private final TorrentCacheResolver resolver;

    public MagnetTaskService(Aria2DaemonManager daemon,
                             Aria2RpcClient rpc,
                             TorrentCacheResolver resolver) {
        this.daemon = daemon;
        this.rpc = rpc;
        this.resolver = resolver;
    }

    public boolean isAvailable() {
        return daemon.isReady();
    }

    public String lastUnavailableReason() {
        return daemon.lastError();
    }

    /**
     * 提交一个 URI（magnet / http(s) / ftp）。
     * <p>磁力链先走缓存解析器，HIT 直接 addTorrent；MISS 或非磁力链走 addUri。
     */
    public AddResult addUri(String uri, String savePath) {
        daemon.requireReady();
        if (uri == null || uri.isBlank()) {
            throw new IllegalArgumentException("uri 不能为空");
        }
        String trimmed = uri.trim();
        Map<String, Object> opts = buildOpts(savePath);

        // 仅对磁力链做缓存解析；http/ftp 直链没必要
        if (trimmed.toLowerCase().startsWith("magnet:")) {
            Optional<byte[]> cached = resolver.resolve(trimmed);
            if (cached.isPresent()) {
                try {
                    String b64 = Base64.getEncoder().encodeToString(cached.get());
                    String gid = rpc.addTorrent(b64, opts);
                    log.info("magnet 解析命中缓存,跳过 metadata 阶段: gid={} uri={}", gid, abbrev(trimmed));
                    return new AddResult(gid, true);
                } catch (IOException e) {
                    log.warn("缓存命中后 addTorrent 失败,fallback 走原始磁力: {}", e.getMessage());
                    // 不抛,继续走 addUri
                }
            }
        }

        try {
            String gid = rpc.addUri(trimmed, opts);
            log.info("magnet task created (DHT 解析): gid={} uri={}", gid, abbrev(trimmed));
            return new AddResult(gid, false);
        } catch (IOException e) {
            throw new MagnetRpcException("addUri 失败：" + e.getMessage(), e);
        }
    }

    public String addTorrent(String torrentBase64, String savePath) {
        daemon.requireReady();
        if (torrentBase64 == null || torrentBase64.isBlank()) {
            throw new IllegalArgumentException("torrent 文件内容不能为空");
        }
        try {
            String gid = rpc.addTorrent(torrentBase64, buildOpts(savePath));
            log.info("magnet task from torrent: gid={}", gid);
            return gid;
        } catch (IOException e) {
            throw new MagnetRpcException("addTorrent 失败：" + e.getMessage(), e);
        }
    }

    public MagnetTaskView getStatus(String gid) {
        daemon.requireReady();
        try {
            return toView(rpc.tellStatus(gid));
        } catch (IOException e) {
            throw new MagnetRpcException("tellStatus 失败：" + e.getMessage(), e);
        }
    }

    public List<MagnetTaskView> listAll(int limit) {
        daemon.requireReady();
        try {
            int safeLimit = Math.max(1, Math.min(200, limit));
            List<MagnetTaskView> out = new ArrayList<>();
            for (var m : rpc.tellActive()) out.add(toView(m));
            for (var m : rpc.tellWaiting(0, safeLimit)) out.add(toView(m));
            for (var m : rpc.tellStopped(0, safeLimit)) out.add(toView(m));
            return out;
        } catch (IOException e) {
            throw new MagnetRpcException("list 失败：" + e.getMessage(), e);
        }
    }

    public void pause(String gid) {
        daemon.requireReady();
        try { rpc.pause(gid); }
        catch (IOException e) { throw new MagnetRpcException("pause 失败：" + e.getMessage(), e); }
    }

    public void resume(String gid) {
        daemon.requireReady();
        try { rpc.unpause(gid); }
        catch (IOException e) { throw new MagnetRpcException("unpause 失败：" + e.getMessage(), e); }
    }

    public void remove(String gid) {
        daemon.requireReady();
        try { rpc.remove(gid); }
        catch (IOException e) { throw new MagnetRpcException("remove 失败：" + e.getMessage(), e); }
    }

    // ---------- helpers ----------

    private static Map<String, Object> buildOpts(String savePath) {
        Map<String, Object> opts = new HashMap<>();
        if (savePath != null && !savePath.isBlank()) {
            opts.put("dir", savePath);
        }
        return opts;
    }

    private static MagnetTaskView toView(Map<String, Object> raw) {
        String gid = str(raw.get("gid"));
        MagnetTaskState state = MagnetTaskState.fromAria2(str(raw.get("status")));
        long total = parseLong(raw.get("totalLength"));
        long done = parseLong(raw.get("completedLength"));
        long upload = parseLong(raw.get("uploadLength"));
        long dlBps = parseLong(raw.get("downloadSpeed"));
        long ulBps = parseLong(raw.get("uploadSpeed"));
        int seeders = (int) parseLong(raw.get("numSeeders"));
        int conns = (int) parseLong(raw.get("connections"));

        Integer errCode = null;
        if (raw.get("errorCode") != null) {
            try { errCode = Integer.parseInt(str(raw.get("errorCode"))); } catch (NumberFormatException ignored) {}
        }
        String errMsg = str(raw.get("errorMessage"));
        if (errMsg != null && errMsg.isBlank()) errMsg = null;

        List<String> filePaths = new ArrayList<>();
        Object filesObj = raw.get("files");
        if (filesObj instanceof List<?> filesList) {
            for (Object f : filesList) {
                if (f instanceof Map<?, ?> fmap) {
                    String path = str(fmap.get("path"));
                    if (path != null && !path.isBlank()) filePaths.add(path);
                }
            }
        }

        String displayName = pickDisplayName(raw, filePaths);
        String infoHash = str(raw.get("infoHash"));
        String savePath = str(raw.get("dir"));

        // resolvedByCache 在列表查询时无法判断,统一回 false
        return new MagnetTaskView(
                gid, state.name(), displayName,
                total, done, upload, dlBps, ulBps,
                seeders, conns, errCode, errMsg,
                filePaths, infoHash, savePath, false);
    }

    private static String pickDisplayName(Map<String, Object> raw, List<String> files) {
        Object bt = raw.get("bittorrent");
        if (bt instanceof Map<?, ?> btMap) {
            Object info = btMap.get("info");
            if (info instanceof Map<?, ?> infoMap) {
                Object name = infoMap.get("name");
                if (name != null) return name.toString();
            }
        }
        if (!files.isEmpty()) {
            String first = files.get(0);
            int sep = Math.max(first.lastIndexOf('/'), first.lastIndexOf('\\'));
            return sep >= 0 ? first.substring(sep + 1) : first;
        }
        return str(raw.get("gid"));
    }

    private static String str(Object o) { return o == null ? null : o.toString(); }

    private static long parseLong(Object o) {
        if (o == null) return 0;
        try { return Long.parseLong(o.toString()); }
        catch (NumberFormatException e) { return 0; }
    }

    private static String abbrev(String s) {
        if (s == null) return "";
        return s.length() <= 80 ? s : s.substring(0, 77) + "...";
    }

    /** addUri 的结果。resolvedByCache=true 表示走了缓存快路径。 */
    public record AddResult(String gid, boolean resolvedByCache) {}

    /** aria2 RPC 调用失败统一抛 502。 */
    @ResponseStatus(HttpStatus.BAD_GATEWAY)
    public static class MagnetRpcException extends RuntimeException {
        public MagnetRpcException(String msg, Throwable cause) { super(msg, cause); }
    }
}
