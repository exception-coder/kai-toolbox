package com.exceptioncoder.toolbox.java8gu.service;

import com.exceptioncoder.toolbox.java8gu.domain.Java8guEnrichRepository;
import com.exceptioncoder.toolbox.llm.config.LlmGatewayProperties;
import com.exceptioncoder.toolbox.llm.routing.ChatModelRouter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
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

    /** 网关档位：与 application.yml 中 toolbox.llm.models[tier=java8gu] 对齐。 */
    private static final String TIER = "java8gu";

    /**
     * 补全提示词模板。{@code __CARD__} 处填入题目原文。
     * 用占位符替换而非 String.format——正文示例里含大量 JSON 花括号，format 会误判占位符。
     */
    private static final String PROMPT = """
            你是 Java 面试知识库的内容加工器。下面是一道八股题的原文（markdown）：
            ====== 原文开始 ======
            __CARD__
            ====== 原文结束 ======

            请**只依据原文**，补全这道题在结构化展示时需要、但原文里缺失或零散的字段，
            输出**一个 JSON 对象**，字段如下（全部必填，无内容时给空数组/空字符串）：

            {
              "diagram": "一段 mermaid 源码，用 flowchart/sequenceDiagram 等把核心流程或关系图形化；原文若已足够简单可为空字符串",
              "qa": [ { "q": "高频面试追问", "a": "简洁准确的答案（1-3 句）" } ],
              "pitfalls": [ "一条易错点/坑（一句话）" ],
              "explanation": "面向面试复习的深度讲解（markdown，200-400 字，先给结论再展开）"
            }

            硬性要求：
            - 严禁编造原文没有依据的结论、数字、API 名；拿不准就少写。
            - mermaid 语法必须可渲染：节点文本用双引号包裹，避免特殊字符破坏语法。
            - 直接输出 JSON 本体，**不要**用代码围栏包裹，**不要**任何前后缀文字。
            """;

    private final ChatModelRouter router;
    private final LlmGatewayProperties gateway;
    private final Java8guEnrichRepository repo;
    private final ObjectMapper objectMapper;

    public Java8guEnrichService(ChatModelRouter router,
                                LlmGatewayProperties gateway,
                                Java8guEnrichRepository repo,
                                ObjectMapper objectMapper) {
        this.router = router;
        this.gateway = gateway;
        this.repo = repo;
        this.objectMapper = objectMapper;
    }

    /**
     * 只读缓存：进题页自动调用，判断该题是否补全过。<b>绝不调用 LLM、无成本。</b>
     *
     * <p>先按当前内容哈希精确命中；未命中则回退「最近一次」补全（内容已变则标 {@code stale=true}）；
     * 都没有则 {@code miss=true}，由前端展示手动「AI 补全」按钮。</p>
     */
    public Map<String, Object> peek(String id, String markdown) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        if (!StringUtils.hasText(markdown)) {
            out.put("hash", "");
            out.put("cached", false);
            out.put("miss", true);
            out.put("stale", false);
            out.putAll(emptyPayload());
            return out;
        }
        String hash = sha256(markdown);
        out.put("hash", hash);

        var exact = repo.find(id, hash);
        if (exact.isPresent()) {
            out.put("cached", true);
            out.put("miss", false);
            out.put("stale", false);
            out.putAll(parsePayload(exact.get()));
            return out;
        }
        var latest = repo.findLatest(id);
        if (latest.isPresent()) {
            out.put("cached", true);
            out.put("miss", false);
            out.put("stale", true); // 命中的是旧内容的补全，原文已更新
            out.putAll(parsePayload(latest.get().payload()));
            return out;
        }
        out.put("cached", false);
        out.put("miss", true);
        out.put("stale", false);
        out.putAll(emptyPayload());
        return out;
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

        // miss 后走共享网关 java8gu 档位，模型名来自中心 LLM 网关配置。
        out.put("cached", false);
        String raw;
        try {
            ChatRequest.Builder rb = ChatRequest.builder()
                    .messages(UserMessage.from(PROMPT.replace("__CARD__", markdown)));
            if (StringUtils.hasText(gateway.getJava8guModel())) {
                rb.modelName(gateway.getJava8guModel());
            }
            ChatResponse resp = router.forTier(TIER).chat(rb.build());
            raw = resp.aiMessage().text();
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
            repo.save(id, hash, payloadJson, StringUtils.hasText(gateway.getJava8guModel()) ? gateway.getJava8guModel() : TIER);
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
