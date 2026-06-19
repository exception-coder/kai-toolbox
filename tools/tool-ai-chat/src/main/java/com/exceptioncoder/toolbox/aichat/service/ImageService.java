package com.exceptioncoder.toolbox.aichat.service;

import com.exceptioncoder.toolbox.aichat.api.dto.ImageGenRequest;
import com.exceptioncoder.toolbox.aichat.api.dto.ImageGenResult;
import com.exceptioncoder.toolbox.aichat.config.AiChatProperties;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.springframework.http.HttpStatus.BAD_GATEWAY;
import static org.springframework.http.HttpStatus.BAD_REQUEST;

/**
 * 绘图：以 OpenAI 兼容协议调网关 {@code POST /v1/images/generations}，同步返回图片地址。
 * 与对话分属不同窗口形态，独立于流式补全链路。
 */
@Service
public class ImageService {

    private static final Logger log = LoggerFactory.getLogger(ImageService.class);
    private static final int MAX_N = 4;

    private final AiChatProperties props;
    private final ModelCatalogService models;
    private final RestClient rest = RestClient.create();

    public ImageService(AiChatProperties props, ModelCatalogService models) {
        this.props = props;
        this.models = models;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record ImagesApiResponse(List<Datum> data) {
        @JsonIgnoreProperties(ignoreUnknown = true)
        private record Datum(String url, String b64_json) {
        }
    }

    public ImageGenResult generate(ImageGenRequest req) {
        String model = req.model();
        if (model == null || model.isBlank()) {
            throw new ResponseStatusException(BAD_REQUEST, "缺少绘图模型");
        }
        if (!models.isAllowed(model)) {
            throw new ResponseStatusException(BAD_REQUEST, "model 不在可用清单内");
        }
        // 绘图接口只接受绘图模型。
        String category = models.categoryOf(model);
        if (category != null && !"image".equals(category)) {
            throw new ResponseStatusException(BAD_REQUEST, "该模型不是绘图模型（category=" + category + "）");
        }
        String prompt = req.prompt() == null ? "" : req.prompt().trim();
        if (prompt.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, "提示词不能为空");
        }
        int n = req.n() == null ? 1 : Math.max(1, Math.min(MAX_N, req.n()));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model);
        body.put("prompt", prompt);
        body.put("n", n);
        if (req.size() != null && !req.size().isBlank()) {
            body.put("size", req.size().trim());
        }

        try {
            ImagesApiResponse resp = rest.post()
                    .uri(props.getBaseUrl() + "/images/generations")
                    .header("Authorization", "Bearer " + props.getApiKey())
                    .body(body)
                    .retrieve()
                    .body(ImagesApiResponse.class);
            if (resp == null || resp.data() == null || resp.data().isEmpty()) {
                throw new ResponseStatusException(BAD_GATEWAY, "网关未返回图片");
            }
            List<String> images = new ArrayList<>();
            for (ImagesApiResponse.Datum d : resp.data()) {
                if (d.url() != null && !d.url().isBlank()) {
                    images.add(d.url());
                } else if (d.b64_json() != null && !d.b64_json().isBlank()) {
                    images.add("data:image/png;base64," + d.b64_json());
                }
            }
            if (images.isEmpty()) {
                throw new ResponseStatusException(BAD_GATEWAY, "网关返回的图片为空");
            }
            return new ImageGenResult(images, model);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (RuntimeException e) {
            log.warn("[ai-chat] 绘图失败 model={}: {}", model, e.toString());
            throw new ResponseStatusException(BAD_GATEWAY, "绘图失败：" + e.getMessage(), e);
        }
    }
}
