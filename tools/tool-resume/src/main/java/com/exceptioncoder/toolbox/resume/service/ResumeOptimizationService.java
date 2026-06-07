package com.exceptioncoder.toolbox.resume.service;

import com.exceptioncoder.toolbox.resume.api.dto.ResumeOptimizationRequest;
import com.exceptioncoder.toolbox.resume.api.dto.ResumeOptimizationResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 简历 AI 优化核心服务：组装 prompt → 调 Spring AI ChatClient → 整理输出。
 *
 * <p>装配方式刻意从简：注入 spring-ai-starter-model-openai 自动配置出的 {@link ChatModel}
 * （连接信息走 application.yml 的 {@code spring.ai.openai.*}，默认 DeepSeek，可切 Ollama/OpenAI），
 * 用 {@link ChatClient#create(ChatModel)} 建客户端，不自建 OpenAiApi / 配置类。
 *
 * <ul>
 *     <li>流式：把 LLM 文本切片原样透传，前端 resultParser 负责解析（后端不解析）。</li>
 *     <li>同步：后端解析 LLM 的 JSON 输出填充 DTO（前端同步路径不再解析）。</li>
 * </ul>
 */
@Service
public class ResumeOptimizationService {

    private static final Logger log = LoggerFactory.getLogger(ResumeOptimizationService.class);

    private final ChatClient chatClient;
    private final ResumePromptTemplateLoader templates;
    private final ObjectMapper objectMapper;

    public ResumeOptimizationService(ChatModel chatModel,
                                     ResumePromptTemplateLoader templates,
                                     ObjectMapper objectMapper) {
        this.chatClient = ChatClient.create(chatModel);
        this.templates = templates;
        this.objectMapper = objectMapper;
    }

    /** 同步优化：阻塞等待完整结果并解析为结构化 DTO。 */
    public ResumeOptimizationResponse optimize(ResumeOptimizationRequest req) {
        ChatResponse resp = promptSpec(req).call().chatResponse();
        String content = resp == null ? "" : resp.getResult().getOutput().getText();
        ResumeOptimizationResponse parsed = parse(content);
        return new ResumeOptimizationResponse(
                parsed.optimizedContent(),
                parsed.changeNotes(),
                parsed.highlightedSkills(),
                tokenUsage(resp));
    }

    /**
     * 流式优化：在虚拟线程订阅 LLM token 流，逐片经 SSE 推 {@code chunk}，结束推 {@code done}。
     * 异常通过 {@link SseEmitter#completeWithError} 抛给前端 onError。
     */
    public void optimizeStream(ResumeOptimizationRequest req, SseEmitter emitter) {
        promptSpec(req).stream().content().subscribe(
                chunk -> sendChunk(emitter, chunk),
                err -> {
                    log.warn("[resume.optimize] LLM 流式失败", err);
                    emitter.completeWithError(err);
                },
                () -> sendDone(emitter));
    }

    private ChatClient.ChatClientRequestSpec promptSpec(ResumeOptimizationRequest req) {
        ChatClient.ChatClientRequestSpec spec = chatClient.prompt()
                .system(templates.systemPrompt())
                .user(templates.render(req));
        if (StringUtils.hasText(req.model())) {
            spec = spec.options(OpenAiChatOptions.builder().model(req.model()).build());
        }
        return spec;
    }

    private void sendChunk(SseEmitter emitter, String chunk) {
        if (chunk == null || chunk.isEmpty()) {
            return;
        }
        try {
            emitter.send(SseEmitter.event().name("chunk").data(Map.of("content", chunk)));
        } catch (Exception e) {
            // 客户端已断开（切页面/取消）：终止流，交由 emitter 回调清理。
            emitter.completeWithError(e);
        }
    }

    private void sendDone(SseEmitter emitter) {
        try {
            emitter.send(SseEmitter.event().name("done").data("{}"));
            emitter.complete();
        } catch (Exception e) {
            emitter.completeWithError(e);
        }
    }

    /**
     * 容错解析 LLM 返回文本：去掉可能的 ```json 围栏后按 JSON 解析；失败则把原文塞进 optimizedContent。
     * 与前端 resultParser 行为对齐，保证同步路径与流式路径语义一致。
     */
    private ResumeOptimizationResponse parse(String raw) {
        String trimmed = stripFence(raw == null ? "" : raw.trim());
        try {
            JsonNode node = objectMapper.readTree(trimmed);
            String optimized = optimizedContentOf(node.get("optimizedContent"));
            List<String> notes = stringArray(node.get("changeNotes"));
            JsonNode skillsNode = node.has("highlightedSkills") ? node.get("highlightedSkills") : node.get("matchedKeywords");
            List<String> skills = stringArray(skillsNode);
            return new ResumeOptimizationResponse(optimized, notes, skills, null);
        } catch (Exception e) {
            log.warn("[resume.optimize] 同步结果非合法 JSON，回退原文", e);
            return new ResumeOptimizationResponse(
                    trimmed, List.of("LLM 返回的不是合法 JSON，已展示原始输出"), List.of(), null);
        }
    }

    private String optimizedContentOf(JsonNode node) {
        if (node == null || node.isNull()) {
            return "";
        }
        // 结构化段约定为「JSON 字符串」；若模型直接给了对象，则序列化回字符串。
        return node.isTextual() ? node.asText() : node.toString();
    }

    private List<String> stringArray(JsonNode node) {
        List<String> list = new ArrayList<>();
        if (node != null && node.isArray()) {
            node.forEach(n -> {
                if (n.isTextual()) {
                    list.add(n.asText());
                }
            });
        }
        return list;
    }

    private static String stripFence(String s) {
        String r = s;
        if (r.startsWith("```json")) {
            r = r.substring(7);
        } else if (r.startsWith("```")) {
            r = r.substring(3);
        }
        if (r.endsWith("```")) {
            r = r.substring(0, r.length() - 3);
        }
        return r.trim();
    }

    private ResumeOptimizationResponse.TokenUsage tokenUsage(ChatResponse resp) {
        if (resp == null || resp.getMetadata() == null || resp.getMetadata().getUsage() == null) {
            return null;
        }
        Usage usage = resp.getMetadata().getUsage();
        return new ResumeOptimizationResponse.TokenUsage(
                box(usage.getPromptTokens()),
                box(usage.getCompletionTokens()),
                box(usage.getTotalTokens()));
    }

    private static Integer box(Number n) {
        return n == null ? null : n.intValue();
    }
}
