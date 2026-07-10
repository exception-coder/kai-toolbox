package com.exceptioncoder.toolbox.java8gu.service;

import com.exceptioncoder.toolbox.java8gu.ai.Java8guEnricher;
import com.exceptioncoder.toolbox.java8gu.domain.Java8guEnrichRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Java 八股「知识补全」服务：cache-first。
 *
 * <p>流程：算内容哈希 → 查 SQLite 缓存命中直接返回 → miss 才调 LLM 加工 → 规整为纯 JSON → 落缓存 → 返回。
 * 补全是"锦上添花"：LLM 不可用 / 解析失败都<b>降级为空补全</b>，绝不 500，前端照常渲染 markdown 原生内容。
 */
@Service
public class Java8guEnrichService {

    private static final Logger log = LoggerFactory.getLogger(Java8guEnrichService.class);

    private final Java8guEnricher enricher;
    private final Java8guEnrichRepository repo;
    private final ObjectMapper objectMapper;

    public Java8guEnrichService(Java8guEnricher enricher,
                                Java8guEnrichRepository repo,
                                ObjectMapper objectMapper) {
        this.enricher = enricher;
        this.repo = repo;
        this.objectMapper = objectMapper;
    }

    /**
     * 取一道题的结构化补全（图解/问答/易错点/深度讲解）。
     *
     * @return Map：payload 的四个字段 + 元信息 {id, hash, cached, ...}；解析/生成失败时返回空补全 + error。
     */
    public Map<String, Object> enrich(String id, String markdown) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);

        if (!StringUtils.hasText(markdown)) {
            out.put("hash", "");
            out.put("cached", false);
            out.putAll(emptyPayload());
            out.put("error", "markdown 为空");
            return out;
        }

        String hash = sha256(markdown);
        out.put("hash", hash);

        // 1) 缓存命中
        var cached = repo.find(id, hash);
        if (cached.isPresent()) {
            out.put("cached", true);
            out.putAll(parsePayload(cached.get()));
            return out;
        }

        // 2) miss → 调 LLM 加工
        out.put("cached", false);
        String raw;
        try {
            raw = enricher.enrich(markdown);
        } catch (Exception e) {
            log.warn("[java8gu] 知识补全 LLM 调用失败 id={}：{}", id, e.toString());
            out.putAll(emptyPayload());
            out.put("error", "LLM 不可用：" + e.getMessage());
            return out;
        }

        // 3) 规整为纯净 JSON payload
        ObjectNode payload = normalize(raw);
        String payloadJson = payload.toString();

        // 4) 落缓存（失败不影响本次返回）
        try {
            repo.save(id, hash, payloadJson, "java8gu");
        } catch (Exception e) {
            log.warn("[java8gu] 补全结果落缓存失败 id={}：{}", id, e.toString());
        }

        out.putAll(parsePayload(payloadJson));
        return out;
    }

    /** 把 LLM 原始输出规整成固定四字段的 ObjectNode（容错：剥围栏、截取首个 JSON 对象）。 */
    private ObjectNode normalize(String raw) {
        ObjectNode node = objectMapper.createObjectNode();
        JsonNode parsed = tryParse(raw);

        node.put("diagram", parsed != null ? parsed.path("diagram").asText("") : "");
        node.set("qa", parsed != null && parsed.has("qa") && parsed.get("qa").isArray()
                ? parsed.get("qa") : objectMapper.createArrayNode());
        node.set("pitfalls", parsed != null && parsed.has("pitfalls") && parsed.get("pitfalls").isArray()
                ? parsed.get("pitfalls") : objectMapper.createArrayNode());
        node.put("explanation", parsed != null ? parsed.path("explanation").asText("") : "");
        return node;
    }

    /** 宽松解析：直接解析失败时，剥掉 ```json 围栏、截取首个 {...} 再试。 */
    private JsonNode tryParse(String raw) {
        if (!StringUtils.hasText(raw)) return null;
        String s = raw.trim();
        try {
            return objectMapper.readTree(s);
        } catch (Exception ignore) {
            // 剥围栏 + 截首个 JSON 对象
            String stripped = s.replaceAll("(?s)```[a-zA-Z]*", "").trim();
            int start = stripped.indexOf('{');
            int end = stripped.lastIndexOf('}');
            if (start >= 0 && end > start) {
                try {
                    return objectMapper.readTree(stripped.substring(start, end + 1));
                } catch (Exception e) {
                    log.warn("[java8gu] 补全 JSON 解析失败，降级空补全：{}", e.toString());
                }
            }
            return null;
        }
    }

    private Map<String, Object> parsePayload(String payloadJson) {
        try {
            JsonNode n = objectMapper.readTree(payloadJson);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("diagram", n.path("diagram").asText(""));
            m.put("qa", objectMapper.convertValue(n.path("qa"), Object.class));
            m.put("pitfalls", objectMapper.convertValue(n.path("pitfalls"), Object.class));
            m.put("explanation", n.path("explanation").asText(""));
            return m;
        } catch (Exception e) {
            return emptyPayload();
        }
    }

    private Map<String, Object> emptyPayload() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("diagram", "");
        m.put("qa", java.util.List.of());
        m.put("pitfalls", java.util.List.of());
        m.put("explanation", "");
        return m;
    }

    private static String sha256(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] d = md.digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(d.length * 2);
            for (byte b : d) sb.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
            return sb.toString();
        } catch (Exception e) {
            return Integer.toHexString(s.hashCode());
        }
    }
}
