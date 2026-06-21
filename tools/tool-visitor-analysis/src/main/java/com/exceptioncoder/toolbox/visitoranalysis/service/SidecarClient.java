package com.exceptioncoder.toolbox.visitoranalysis.service;

import com.exceptioncoder.toolbox.visitoranalysis.api.dto.MatchResult;
import com.exceptioncoder.toolbox.visitoranalysis.api.dto.SidecarVerdict;
import com.exceptioncoder.toolbox.visitoranalysis.api.dto.VisitorInput;
import com.exceptioncoder.toolbox.visitoranalysis.config.VisitorAnalysisProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 调 Python AgentScope sidecar 做灰区分类。仅在确定性匹配无法定论时调用（LLM-last）。
 * 任何失败（未配置 / 连不上 / 解析失败）都返回 null,由 VerdictService 降级处理,绝不让灰区把整条流程拖垮。
 */
@Component("visitorAnalysisSidecarClient")
public class SidecarClient {

    private static final Logger log = LoggerFactory.getLogger(SidecarClient.class);

    private final VisitorAnalysisProperties props;
    private final Environment env;
    private final ObjectMapper mapper = new ObjectMapper();
    // uvicorn 仅 HTTP/1.1,固定版本避免 h2c 协商问题（与 WhisperAsrClient 同理）。
    private final HttpClient http = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    public SidecarClient(VisitorAnalysisProperties props, Environment env) {
        this.props = props;
        this.env = env;
    }

    /** {@code GET /health} 探活,失败返回 false。 */
    public boolean ping() {
        if (props.getSidecarUrl().isBlank()) return false;
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(props.getSidecarUrl() + "/health"))
                    .timeout(Duration.ofSeconds(2)).GET().build();
            return http.send(req, HttpResponse.BodyHandlers.discarding()).statusCode() == 200;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * 灰区分类。把归一化字段 + 匹配上下文 + 候选类别交给 sidecar,拿回结构化提议。
     * @return 提议；不可用时返回 null
     */
    public SidecarVerdict classify(VisitorInput in, String phoneNorm, String companyNorm,
                                   String addrNorm, MatchResult match) {
        if (props.getSidecarUrl().isBlank()) {
            log.debug("sidecar 未配置,跳过灰区分类");
            return null;
        }
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("name", in.name());
            body.put("phone", in.phone());
            body.put("company", in.company());
            body.put("company_addr", in.companyAddr());
            body.put("addr_norm", addrNorm);               // 地址归一化结果，辅助 LLM 理解
            body.put("email", in.email());
            body.put("purpose", in.purpose());
            body.put("phone_norm", phoneNorm);
            body.put("company_norm", companyNorm);
            body.put("visit_count", match.visitCount());
            // 地址软匹配提示（若有相同城市+区的客户，提供给 LLM 作为参考上下文）
            if (match.addrHint() != null && !match.addrHint().isBlank()) {
                body.put("addr_hint", match.addrHint());
            }

            // 复用配置中心「AI 对话」的 4sapi 凭证（toolbox.ai-chat.*，动态可改），随请求下发给 sidecar；
            // 缺 key 时不下发，sidecar 回退自身 VA_LLM_* 环境变量。model 用本模块配置（默认便宜模型）。
            String apiKey = env.getProperty("toolbox.ai-chat.api-key", "");
            if (apiKey != null && !apiKey.isBlank()) {
                Map<String, Object> llm = new LinkedHashMap<>();
                llm.put("base_url", env.getProperty("toolbox.ai-chat.base-url", "https://4sapi.com/v1"));
                llm.put("api_key", apiKey);
                llm.put("model", props.getLlmModel());
                body.put("llm", llm);
            }

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(props.getSidecarUrl() + "/analyze"))
                    .timeout(Duration.ofSeconds(props.getSidecarTimeoutSeconds()))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .build();

            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                log.warn("sidecar 返回 HTTP {}: {}", resp.statusCode(), resp.body());
                return null;
            }
            JsonNode n = mapper.readTree(resp.body());
            List<String> evidence = new ArrayList<>();
            if (n.has("evidence") && n.get("evidence").isArray()) {
                n.get("evidence").forEach(e -> evidence.add(e.asText()));
            }
            return new SidecarVerdict(
                    n.path("identity").asText(null),
                    n.path("relationship").asText(null),
                    n.has("confidence") ? n.get("confidence").asDouble() : null,
                    n.path("rationale").asText(null),
                    evidence,
                    n.path("model").asText(null),
                    n.path("degraded").asBoolean(false));
        } catch (Exception e) {
            log.warn("sidecar 调用失败,降级处理: {}", e.toString());
            return null;
        }
    }
}
