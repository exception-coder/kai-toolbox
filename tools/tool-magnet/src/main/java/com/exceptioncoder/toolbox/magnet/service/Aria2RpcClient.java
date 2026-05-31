package com.exceptioncoder.toolbox.magnet.service;

import com.exceptioncoder.toolbox.magnet.config.MagnetProperties;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * aria2 JSON-RPC over HTTP 客户端。
 *
 * <h3>关键事实</h3>
 * <ul>
 *   <li>aria2 数值字段全部用字符串表示（防 JS 精度丢失），所以这里所有 totalLength 等都需要 parseLong</li>
 *   <li>secret token 作为第一个 param 传入：{@code "token:<secret>"}</li>
 *   <li>所有方法都是同步阻塞调用；上层 service 自己用线程池调度</li>
 * </ul>
 */
@Component
public class Aria2RpcClient {

    private static final Logger log = LoggerFactory.getLogger(Aria2RpcClient.class);
    private static final MediaType JSON = MediaType.parse("application/json");

    private final MagnetProperties props;
    private final ObjectMapper mapper;
    private final OkHttpClient http;
    private final AtomicLong reqIdSeq = new AtomicLong();

    /** daemon 启动后由 manager 写入；为空表示尚未就绪 */
    private volatile String effectiveSecret;

    public Aria2RpcClient(MagnetProperties props, ObjectMapper mapper) {
        this.props = props;
        this.mapper = mapper;
        // RPC 在本机 loopback，5s 超时足够
        this.http = new OkHttpClient.Builder()
                .connectTimeout(2, TimeUnit.SECONDS)
                .readTimeout(5, TimeUnit.SECONDS)
                .build();
    }

    public void setEffectiveSecret(String secret) {
        this.effectiveSecret = secret;
    }

    /** 轻量 ping：返回 daemon 是否可达。用 aria2.getVersion，几乎无副作用。 */
    public boolean ping() {
        try {
            call("aria2.getVersion", List.of(), new TypeReference<Map<String, Object>>() {});
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** 添加 URI 任务（支持 http(s)://、ftp://、magnet:?xt=urn:btih:...）。 */
    public String addUri(String uri, Map<String, Object> options) throws IOException {
        List<Object> params = new ArrayList<>();
        params.add(List.of(uri));
        params.add(options == null ? Map.of() : options);
        return call("aria2.addUri", params, new TypeReference<String>() {});
    }

    /** 添加 .torrent 文件（base64 编码）。 */
    public String addTorrent(String torrentBase64, Map<String, Object> options) throws IOException {
        List<Object> params = new ArrayList<>();
        params.add(torrentBase64);
        params.add(List.of());            // webseed URI 列表，留空
        params.add(options == null ? Map.of() : options);
        return call("aria2.addTorrent", params, new TypeReference<String>() {});
    }

    public Map<String, Object> tellStatus(String gid) throws IOException {
        return call("aria2.tellStatus", List.of(gid), new TypeReference<Map<String, Object>>() {});
    }

    public List<Map<String, Object>> tellActive() throws IOException {
        return call("aria2.tellActive", List.of(), new TypeReference<List<Map<String, Object>>>() {});
    }

    public List<Map<String, Object>> tellWaiting(int offset, int num) throws IOException {
        return call("aria2.tellWaiting", List.of(offset, num),
                new TypeReference<List<Map<String, Object>>>() {});
    }

    public List<Map<String, Object>> tellStopped(int offset, int num) throws IOException {
        return call("aria2.tellStopped", List.of(offset, num),
                new TypeReference<List<Map<String, Object>>>() {});
    }

    public void pause(String gid) throws IOException {
        call("aria2.pause", List.of(gid), new TypeReference<String>() {});
    }

    public void unpause(String gid) throws IOException {
        call("aria2.unpause", List.of(gid), new TypeReference<String>() {});
    }

    /** 强制移除任务。forceRemove 比 remove 更稳；stopped 任务用 removeDownloadResult 清理。 */
    public void remove(String gid) throws IOException {
        try {
            call("aria2.forceRemove", List.of(gid), new TypeReference<String>() {});
        } catch (IOException e) {
            call("aria2.removeDownloadResult", List.of(gid), new TypeReference<String>() {});
        }
    }

    public void shutdown() throws IOException {
        call("aria2.shutdown", List.of(), new TypeReference<String>() {});
    }

    // ---------- core ----------

    private <T> T call(String method, List<Object> userParams, TypeReference<T> resultType) throws IOException {
        List<Object> params = new ArrayList<>();
        String secret = effectiveSecret;
        if (secret != null && !secret.isBlank()) {
            params.add("token:" + secret);
        }
        params.addAll(userParams);

        Map<String, Object> body = new HashMap<>();
        body.put("jsonrpc", "2.0");
        body.put("id", "kai-" + reqIdSeq.incrementAndGet());
        body.put("method", method);
        body.put("params", params);

        byte[] bodyBytes = mapper.writeValueAsBytes(body);
        Request req = new Request.Builder()
                .url("http://127.0.0.1:" + props.getRpcPort() + "/jsonrpc")
                .post(RequestBody.create(bodyBytes, JSON))
                .build();

        try (Response resp = http.newCall(req).execute();
             ResponseBody respBody = resp.body()) {
            if (!resp.isSuccessful() || respBody == null) {
                throw new IOException("aria2 RPC HTTP " + resp.code());
            }
            Map<String, Object> envelope = mapper.readValue(respBody.bytes(),
                    new TypeReference<Map<String, Object>>() {});
            Object error = envelope.get("error");
            if (error != null) {
                throw new IOException("aria2 RPC error: " + error);
            }
            Object result = envelope.get("result");
            return mapper.convertValue(result, resultType);
        }
    }

    @SuppressWarnings("unused")
    private static void touch(Logger l) { l.debug("aria2 rpc client init"); }
}
