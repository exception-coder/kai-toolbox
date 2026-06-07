package com.exceptioncoder.toolbox.resume.service;

import com.exceptioncoder.toolbox.resume.api.dto.ResumeOptimizationRequest;
import com.exceptioncoder.toolbox.resume.api.dto.ResumeOptimizationResponse;
import com.exceptioncoder.toolbox.resume.api.dto.SectionType;
import com.exceptioncoder.toolbox.resume.api.dto.WholeOptimizationRequest;
import com.exceptioncoder.toolbox.resume.api.dto.WholeOptimizationResponse;
import com.exceptioncoder.toolbox.claudechat.service.AgentOneShotService;
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
 * <p>两种引擎：
 * <ul>
 *     <li><b>fast</b>（默认）：spring-ai-starter-model-openai 自动配置的 {@link ChatModel}
 *     （{@code spring.ai.openai.*}，默认 DeepSeek deepseek-chat）。</li>
 *     <li><b>quality</b>：走 Claude 编码 Agent（复用 claude-chat 的 {@link AgentOneShotService} 跑一次性任务），
 *     用 Claude 登录态、不花 DeepSeek key；Agent 当作更强的 LLM，纯文本进出。</li>
 * </ul>
 * 整篇优化（optimizeWhole）暂只走 fast。
 */
@Service
public class ResumeOptimizationService {

    private static final Logger log = LoggerFactory.getLogger(ResumeOptimizationService.class);

    /** 快速引擎：自动配置的 ChatModel（spring.ai.openai.*，默认 DeepSeek deepseek-chat）。 */
    private final ChatClient fastClient;
    /** 高质量引擎：Claude 编码 Agent（claude-chat sidecar）。 */
    private final AgentOneShotService agentOneShot;
    private final ResumePromptTemplateLoader templates;
    private final ObjectMapper objectMapper;

    public ResumeOptimizationService(ChatModel chatModel,
                                     AgentOneShotService agentOneShot,
                                     ResumePromptTemplateLoader templates,
                                     ObjectMapper objectMapper) {
        this.fastClient = ChatClient.create(chatModel);
        this.agentOneShot = agentOneShot;
        this.templates = templates;
        this.objectMapper = objectMapper;
    }

    /** quality 引擎走 Claude 编码 Agent；其余（含 null）走 fast。 */
    private boolean isAgent(String engine) {
        return "quality".equalsIgnoreCase(engine);
    }

    /** 同步优化：阻塞等待完整结果并解析为结构化 DTO。 */
    public ResumeOptimizationResponse optimize(ResumeOptimizationRequest req) {
        if (isAgent(req.engine())) {
            String text = agentOneShot.runOnce(templates.systemPrompt(), templates.render(req), req.model());
            return parse(text);
        }
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
     * 流式优化：逐片经 SSE 推 {@code chunk}，结束推 {@code done}。
     * 出错时推一个 {@code error} 事件（带 message）再 complete，让前端能明确提示而不是静默卡住。
     * quality 引擎在虚拟线程里阻塞跑 Agent，把 delta 当 chunk 推。
     */
    public void optimizeStream(ResumeOptimizationRequest req, SseEmitter emitter) {
        if (isAgent(req.engine())) {
            Thread.ofVirtual().start(() -> {
                try {
                    agentOneShot.stream(templates.systemPrompt(), templates.render(req), req.model(),
                            delta -> sendChunk(emitter, delta));
                    sendDone(emitter);
                } catch (Exception e) {
                    log.warn("[resume.optimize] Agent 流式失败", e);
                    sendError(emitter, e);
                }
            });
            return;
        }
        promptSpec(req).stream().content().subscribe(
                chunk -> sendChunk(emitter, chunk),
                err -> {
                    log.warn("[resume.optimize] LLM 流式失败", err);
                    sendError(emitter, err);
                },
                () -> sendDone(emitter));
    }

    /** 整篇优化：一次把整张简历喂给 LLM（仅 fast 引擎），解析出多段建议。 */
    public WholeOptimizationResponse optimizeWhole(WholeOptimizationRequest req) {
        ChatClient.ChatClientRequestSpec spec = fastClient.prompt()
                .system(templates.systemPrompt())
                .user(templates.renderWhole(req));
        if (StringUtils.hasText(req.model())) {
            spec = spec.options(OpenAiChatOptions.builder().model(req.model()).build());
        }
        String content = spec.call().content();
        return parseWhole(content);
    }

    /** 解析整篇结果顶层 {"sections":[...]}；整体解析失败则返回空列表（前端据此提示）。 */
    private WholeOptimizationResponse parseWhole(String raw) {
        String trimmed = stripFence(raw == null ? "" : raw.trim());
        List<WholeOptimizationResponse.SectionResult> sections = new ArrayList<>();
        try {
            JsonNode root = objectMapper.readTree(trimmed);
            JsonNode arr = root.get("sections");
            if (arr != null && arr.isArray()) {
                for (JsonNode node : arr) {
                    SectionType type = parseSectionType(node.get("sectionType"));
                    if (type == null) {
                        continue;
                    }
                    JsonNode idNode = node.get("itemId");
                    String itemId = (idNode == null || idNode.isNull()) ? null : idNode.asText();
                    JsonNode skillsNode = node.has("highlightedSkills") ? node.get("highlightedSkills") : node.get("matchedKeywords");
                    sections.add(new WholeOptimizationResponse.SectionResult(
                            type,
                            itemId,
                            optimizedContentOf(node.get("optimizedContent")),
                            stringArray(node.get("changeNotes")),
                            stringArray(skillsNode)));
                }
            }
        } catch (Exception e) {
            log.warn("[resume.optimize] 整篇结果非合法 JSON，返回空建议", e);
        }
        return new WholeOptimizationResponse(sections);
    }

    private static SectionType parseSectionType(JsonNode node) {
        if (node == null || !node.isTextual()) {
            return null;
        }
        try {
            return SectionType.valueOf(node.asText());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private ChatClient.ChatClientRequestSpec promptSpec(ResumeOptimizationRequest req) {
        ChatClient.ChatClientRequestSpec spec = fastClient.prompt()
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

    private void sendError(SseEmitter emitter, Throwable err) {
        String message = err.getMessage() == null ? err.getClass().getSimpleName() : err.getMessage();
        try {
            emitter.send(SseEmitter.event().name("error").data(Map.of("message", "优化失败：" + message)));
            emitter.complete();
        } catch (Exception e) {
            // 连接已断，无法回写错误，仅终止。
            emitter.completeWithError(err);
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
