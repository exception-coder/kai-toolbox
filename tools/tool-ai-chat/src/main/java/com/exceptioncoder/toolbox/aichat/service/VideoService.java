package com.exceptioncoder.toolbox.aichat.service;

import com.exceptioncoder.toolbox.aichat.api.dto.VideoGenRequest;
import com.exceptioncoder.toolbox.aichat.api.dto.VideoTask;
import com.exceptioncoder.toolbox.aichat.config.AiChatProperties;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
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
}
