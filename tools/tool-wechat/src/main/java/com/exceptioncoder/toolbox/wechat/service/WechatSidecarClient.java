package com.exceptioncoder.toolbox.wechat.service;

import com.exceptioncoder.toolbox.wechat.api.dto.ChatSummary;
import com.exceptioncoder.toolbox.wechat.api.dto.WxMessage;
import com.exceptioncoder.toolbox.wechat.config.WechatProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.net.ConnectException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 调 Python wxauto sidecar（python-services/wechat）。所有微信 GUI 操作都在 sidecar，
 * 这里只用 JDK 自带 HttpClient 走 HTTP/1.1（uvicorn 仅 HTTP/1.1，与其它 sidecar client 同理）。
 *
 * 失败语义：读类（health/sessions/messages/poll）失败返回空/降级，不抛；
 * 写类（send/listen）失败抛 {@link SidecarException}，由 Controller 转成 4xx/5xx 给前端。
 */
@Component
public class WechatSidecarClient {

    private static final Logger log = LoggerFactory.getLogger(WechatSidecarClient.class);

    private final WechatProperties props;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    public WechatSidecarClient(WechatProperties props) {
        this.props = props;
    }

    public static class SidecarException extends RuntimeException {
        public SidecarException(String message) { super(message); }
    }

    /** sidecar 进程没起来（连不上 127.0.0.1:port）。监听轮询据此退避，不当成普通错误刷日志。 */
    public static class SidecarOfflineException extends RuntimeException {
    }

    private boolean configured() {
        return props.getSidecarUrl() != null && !props.getSidecarUrl().isBlank();
    }

    private HttpRequest.Builder req(String path) {
        return HttpRequest.newBuilder()
                .uri(URI.create(props.getSidecarUrl() + path))
                .timeout(Duration.ofSeconds(props.getTimeoutSeconds()));
    }

    /** {@code GET /health}，原样返回 sidecar 的能力上报；不可用时返回 {online:false}。 */
    public JsonNode health() {
        if (!configured()) {
            return mapper.valueToTree(Map.of("status", "unconfigured", "wechat_online", false));
        }
        try {
            HttpResponse<String> resp = http.send(
                    req("/health").timeout(Duration.ofSeconds(3)).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() == 200) {
                return mapper.readTree(resp.body());
            }
        } catch (Exception e) {
            log.debug("health 失败: {}", e.toString());
        }
        return mapper.valueToTree(Map.of("status", "offline", "wechat_online", false));
    }

    public boolean ping() {
        return health().path("wechat_online").asBoolean(false);
    }

    /** {@code GET /sessions}。失败返回空列表（降级）。 */
    public List<ChatSummary> sessions() {
        if (!configured()) return List.of();
        try {
            HttpResponse<String> resp = http.send(req("/sessions").GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) return List.of();
            List<ChatSummary> out = new ArrayList<>();
            for (JsonNode n : mapper.readTree(resp.body())) {
                out.add(new ChatSummary(n.path("name").asText(""), n.path("unread").asInt(0)));
            }
            return out;
        } catch (Exception e) {
            log.debug("sessions 失败: {}", e.toString());
            return List.of();
        }
    }

    /** {@code GET /messages?who=&count=}。失败返回空列表（降级）。 */
    public List<WxMessage> messages(String who, int count) {
        if (!configured()) return List.of();
        try {
            String url = "/messages?who=" + enc(who) + "&count=" + count;
            HttpResponse<String> resp = http.send(req(url).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) return List.of();
            return parseMessages(resp.body());
        } catch (Exception e) {
            log.debug("messages 失败: {}", e.toString());
            return List.of();
        }
    }

    /**
     * {@code GET /listen/poll}，drain sidecar 缓存的新消息。
     * 连不上 sidecar（进程没起）抛 {@link SidecarOfflineException}，由监听轮询退避；
     * 其它错误（HTTP 非 200 / 解析失败）返回空列表降级。
     */
    public List<WxMessage> poll() {
        if (!configured()) throw new SidecarOfflineException();
        try {
            HttpResponse<String> resp = http.send(req("/listen/poll").GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) return List.of();
            return parseMessages(resp.body());
        } catch (ConnectException | HttpConnectTimeoutException e) {
            throw new SidecarOfflineException();
        } catch (Exception e) {
            log.debug("poll 失败: {}", e.toString());
            return List.of();
        }
    }

    /** {@code POST /send}。失败抛 SidecarException。 */
    public void send(String who, String text) {
        ensureConfigured();
        try {
            String body = mapper.writeValueAsString(Map.of("who", who, "text", text));
            HttpResponse<String> resp = http.send(
                    req("/send").header("Content-Type", "application/json")
                            .POST(HttpRequest.BodyPublishers.ofString(body)).build(),
                    HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                throw new SidecarException("发送失败 HTTP " + resp.statusCode() + ": " + resp.body());
            }
        } catch (SidecarException e) {
            throw e;
        } catch (Exception e) {
            throw new SidecarException("发送失败: " + e.getMessage());
        }
    }

    /** {@code POST /listen/add}。 */
    public void listenAdd(String who) {
        listenOp("/listen/add", who);
    }

    /** {@code POST /listen/remove}。 */
    public void listenRemove(String who) {
        listenOp("/listen/remove", who);
    }

    private void listenOp(String path, String who) {
        ensureConfigured();
        try {
            String body = mapper.writeValueAsString(Map.of("who", who));
            HttpResponse<String> resp = http.send(
                    req(path).header("Content-Type", "application/json")
                            .POST(HttpRequest.BodyPublishers.ofString(body)).build(),
                    HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                throw new SidecarException(path + " 失败 HTTP " + resp.statusCode() + ": " + resp.body());
            }
        } catch (SidecarException e) {
            throw e;
        } catch (Exception e) {
            throw new SidecarException(path + " 失败: " + e.getMessage());
        }
    }

    private List<WxMessage> parseMessages(String json) throws Exception {
        List<WxMessage> out = new ArrayList<>();
        for (JsonNode n : mapper.readTree(json)) {
            out.add(new WxMessage(
                    n.path("chat").asText(""),
                    n.path("sender").asText(""),
                    n.path("content").asText(""),
                    n.path("type").asText(""),
                    n.path("time").asText(""),
                    n.path("msg_id").asText("")));
        }
        return out;
    }

    private void ensureConfigured() {
        if (!configured()) {
            throw new SidecarException("wechat sidecar 未配置（toolbox.wechat.sidecar-url 为空）");
        }
    }

    private static String enc(String s) {
        return URLEncoder.encode(s == null ? "" : s, StandardCharsets.UTF_8);
    }
}
