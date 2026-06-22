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

    // ── 向量索引（fire-and-forget，虚拟线程异步，失败只 debug 不抛）─────────────

    /**
     * 把一条客户记录异步索引到 Qdrant（/index/customer）。
     * 用于新增/导入客户后，让该客户可被向量召回。
     */
    public void indexCustomer(String company, String companyNorm, String addrNorm, String status) {
        if (props.getSidecarUrl().isBlank()) return;
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("company",      company      != null ? company      : "");
        body.put("company_norm", companyNorm  != null ? companyNorm  : "");
        body.put("addr_norm",    addrNorm     != null ? addrNorm     : "");
        body.put("status",       status       != null ? status       : "");
        _postAsync("/index/customer", body);
    }

    /**
     * 把一条已判别的访客记录异步索引到 Qdrant（/index/visitor）。
     * 用于每次判别完成后积累历史案例，逐步提升向量召回质量。
     */
    public void indexVisitor(com.exceptioncoder.toolbox.visitoranalysis.api.dto.VisitorInput in,
                              String addrNorm, String identity, String relationship, double confidence) {
        if (props.getSidecarUrl().isBlank()) return;
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("company",      in.company()     != null ? in.company()     : "");
        body.put("company_addr", in.companyAddr() != null ? in.companyAddr() : "");
        body.put("company_norm", normalizeCompany(in.company()));
        body.put("addr_norm",    addrNorm         != null ? addrNorm         : "");
        body.put("purpose",      in.purpose()     != null ? in.purpose()     : "");
        body.put("identity",     identity);
        body.put("relationship", relationship);
        body.put("confidence",   confidence);
        _postAsync("/index/visitor", body);
    }

    /** 公司名轻量归一化（复制 Normalizer 的核心逻辑，避免循环依赖）。 */
    private static String normalizeCompany(String raw) {
        if (raw == null) return "";
        String s = raw.replaceAll("\\s+", "").trim();
        for (String noise : new String[]{"股份有限公司","有限责任公司","有限公司","(中国)","（中国）","集团","公司","企业"}) {
            s = s.replace(noise, "");
        }
        return s;
    }

    private void _postAsync(String path, Map<String, Object> body) {
        Thread.ofVirtual().start(() -> {
            try {
                HttpRequest req = HttpRequest.newBuilder()
                        .uri(URI.create(props.getSidecarUrl() + path))
                        .timeout(Duration.ofSeconds(5))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                        .build();
                http.send(req, HttpResponse.BodyHandlers.discarding());
            } catch (Exception e) {
                log.debug("[sidecar] {} 异步索引失败（忽略）: {}", path, e.toString());
            }
        });
    }

    /**
     * 同步索引一条客户记录到 Qdrant（{@code POST /index/customer}），返回 sidecar 是否确认入库。
     * 与 fire-and-forget 的 {@link #indexCustomer} 区别：阻塞等回执，供「一键同步底库」逐条统计成功/失败。
     * 传入 custId 作为 sidecar 端 point id 的稳定 key，重复同步走 upsert 不产生重复点。
     */
    public boolean indexCustomerSync(Long custId, String company, String companyNorm,
                                     String companyAddr, String addrNorm, String status) {
        if (props.getSidecarUrl().isBlank()) return false;
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            if (custId != null) body.put("id", custId);
            body.put("company",      company      != null ? company      : "");
            body.put("company_norm", companyNorm  != null ? companyNorm  : "");
            body.put("company_addr", companyAddr  != null ? companyAddr  : "");
            body.put("addr_norm",    addrNorm     != null ? addrNorm     : "");
            body.put("status",       status       != null ? status       : "");
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(props.getSidecarUrl() + "/index/customer"))
                    .timeout(Duration.ofSeconds(30))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                log.warn("[sidecar] /index/customer HTTP {}: {}", resp.statusCode(), resp.body());
                return false;
            }
            return mapper.readTree(resp.body()).path("indexed").asBoolean(false);
        } catch (Exception e) {
            log.warn("[sidecar] indexCustomerSync 失败: {}", e.toString());
            return false;
        }
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
