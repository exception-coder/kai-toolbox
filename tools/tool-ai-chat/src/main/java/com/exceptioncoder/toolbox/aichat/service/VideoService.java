package com.exceptioncoder.toolbox.aichat.service;

import com.exceptioncoder.toolbox.aichat.api.dto.VideoGenRequest;
import com.exceptioncoder.toolbox.aichat.api.dto.VideoTask;
import com.exceptioncoder.toolbox.aichat.config.AiChatProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.springframework.http.HttpStatus.BAD_GATEWAY;
import static org.springframework.http.HttpStatus.BAD_REQUEST;

/**
 * 视频生成（异步）：OpenAI Sora-2 风格。提交 {@code POST /v1/videos} 拿 task id，
 * 轮询 {@code GET /v1/videos/{id}} 取状态与完成后的视频地址。与对话/绘图分属不同窗口形态。
 */
@Service
public class VideoService {

    private static final Logger log = LoggerFactory.getLogger(VideoService.class);

    private final AiChatProperties props;
    private final ModelCatalogService models;
    private final RestClient rest = RestClient.create();
    private final ObjectMapper json = new ObjectMapper();

    public VideoService(AiChatProperties props, ModelCatalogService models) {
        this.props = props;
        this.models = models;
    }

    public VideoTask submit(VideoGenRequest req) {
        String model = req.model();
        if (model == null || model.isBlank()) {
            throw new ResponseStatusException(BAD_REQUEST, "缺少视频模型");
        }
        if (!models.isAllowed(model)) {
            throw new ResponseStatusException(BAD_REQUEST, "model 不在可用清单内");
        }
        String category = models.categoryOf(model);
        if (category != null && !"video".equals(category)) {
            throw new ResponseStatusException(BAD_REQUEST, "该模型不是视频模型（category=" + category + "）");
        }
        String prompt = req.prompt() == null ? "" : req.prompt().trim();
        if (prompt.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, "提示词不能为空");
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model);
        body.put("prompt", prompt);
        if (req.seconds() != null && !req.seconds().isBlank()) {
            body.put("seconds", req.seconds().trim());
        }
        if (req.size() != null && !req.size().isBlank()) {
            body.put("size", req.size().trim());
        }
        try {
            JsonNode resp = rest.post()
                    .uri(props.getBaseUrl() + "/videos")
                    .header("Authorization", "Bearer " + props.getApiKey())
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
            if (resp == null || resp.path("id").asText("").isBlank()) {
                throw new ResponseStatusException(BAD_GATEWAY, "网关未返回任务 id");
            }
            return new VideoTask(resp.path("id").asText(), resp.path("status").asText("queued"), null, null, model);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (RestClientResponseException e) {
            // 网关返回的 4xx/5xx：提炼其响应体里的真实错误(如 model_not_found / 无可用渠道)透传。
            String detail = extractGatewayError(e);
            log.warn("[ai-chat] 视频提交失败 model={}: status={} detail={}", model, e.getStatusCode(), detail);
            throw new ResponseStatusException(mapStatus(e.getStatusCode(), detail), "视频提交失败：" + detail, e);
        } catch (RuntimeException e) {
            log.warn("[ai-chat] 视频提交失败 model={}: {}", model, e.toString());
            throw new ResponseStatusException(BAD_GATEWAY, "视频提交失败：" + e.getMessage(), e);
        }
    }

    public VideoTask query(String id) {
        if (id == null || id.isBlank()) {
            throw new ResponseStatusException(BAD_REQUEST, "缺少任务 id");
        }
        try {
            JsonNode n = rest.get()
                    .uri(props.getBaseUrl() + "/videos/" + id)
                    .header("Authorization", "Bearer " + props.getApiKey())
                    .retrieve()
                    .body(JsonNode.class);
            if (n == null) {
                throw new ResponseStatusException(BAD_GATEWAY, "网关未返回任务状态");
            }
            String status = n.path("status").asText("");
            return new VideoTask(id, status, findVideoUrl(n), findError(n), n.path("model").asText(null));
        } catch (ResponseStatusException e) {
            throw e;
        } catch (RestClientResponseException e) {
            String detail = extractGatewayError(e);
            log.warn("[ai-chat] 视频轮询失败 id={}: status={} detail={}", id, e.getStatusCode(), detail);
            throw new ResponseStatusException(mapStatus(e.getStatusCode(), detail), "视频轮询失败：" + detail, e);
        } catch (RuntimeException e) {
            log.warn("[ai-chat] 视频轮询失败 id={}: {}", id, e.toString());
            throw new ResponseStatusException(BAD_GATEWAY, "视频轮询失败：" + e.getMessage(), e);
        }
    }

    /** 兼容多种返回结构定位视频地址：task_result.videos[].url / result_urls[] / data[].url / url。 */
    private static String findVideoUrl(JsonNode n) {
        JsonNode videos = n.path("task_result").path("videos");
        if (videos.isArray() && !videos.isEmpty()) {
            String u = videos.get(0).path("url").asText("");
            if (!u.isBlank()) {
                return u;
            }
        }
        JsonNode resultUrls = n.path("result_urls");
        if (resultUrls.isArray() && !resultUrls.isEmpty()) {
            String u = resultUrls.get(0).asText("");
            if (!u.isBlank()) {
                return u;
            }
        }
        JsonNode data = n.path("data");
        if (data.isArray() && !data.isEmpty()) {
            String u = data.get(0).path("url").asText("");
            if (!u.isBlank()) {
                return u;
            }
        }
        String u = n.path("url").asText("");
        return u.isBlank() ? null : u;
    }

    private static String findError(JsonNode n) {
        for (String f : new String[]{"error", "failure_reason", "fail_reason", "message"}) {
            JsonNode e = n.path(f);
            if (e.isTextual() && !e.asText().isBlank()) {
                return e.asText();
            }
            if (e.isObject() && e.path("message").isTextual()) {
                return e.path("message").asText();
            }
        }
        return null;
    }

    /**
     * 从网关错误响应体里提炼对用户有意义的报错。New API 网关常把错误层层嵌套且内层是
     * 被转义的 JSON 字符串(如 {@code {"code":"fail_to_fetch_task","message":"{\"error\":{\"message\":\"No available channel...\"}}"}}),
     * 这里递归下钻到最内层的 message,拿不到结构则回退原始响应体。
     */
    private String extractGatewayError(RestClientResponseException e) {
        String raw = e.getResponseBodyAsString();
        if (raw == null || raw.isBlank()) {
            return e.getStatusText();
        }
        try {
            String msg = deepestMessage(json.readTree(raw), 0);
            return msg != null ? msg : raw;
        } catch (Exception parseErr) {
            return raw;
        }
    }

    /** 递归找最内层的 error.message / message;内层 message 若本身是 JSON 串则继续下钻(限深防御)。 */
    private String deepestMessage(JsonNode node, int depth) {
        if (node == null || depth > 6) {
            return null;
        }
        JsonNode msg = node.path("error").path("message");
        if (!msg.isTextual()) {
            msg = node.path("message");
        }
        if (msg.isTextual() && !msg.asText().isBlank()) {
            String text = msg.asText().trim();
            // 内层 message 仍是 JSON 串(以 { 开头),继续解析下钻;否则即最终人类可读文案。
            if (text.startsWith("{")) {
                try {
                    String inner = deepestMessage(json.readTree(text), depth + 1);
                    return inner != null ? inner : text;
                } catch (Exception ignore) {
                    return text;
                }
            }
            return text;
        }
        return null;
    }

    /** 网关 5xx「模型不存在/无可用渠道」实为配置问题,对前端按 400 呈现更准确;其余 5xx 仍按 502。 */
    private static HttpStatusCode mapStatus(HttpStatusCode gatewayStatus, String detail) {
        String d = detail == null ? "" : detail.toLowerCase();
        if (d.contains("model_not_found") || d.contains("no available channel")
                || d.contains("无可用") || d.contains("not found")) {
            return BAD_REQUEST;
        }
        return BAD_GATEWAY;
    }
}
