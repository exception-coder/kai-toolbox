package com.exceptioncoder.toolbox.aisecretary.service;

import com.exceptioncoder.toolbox.aisecretary.ai.RecallAssistant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 回忆态编排（确定性优先 / 召回可见）：
 * <ol>
 *   <li>{@link RecallRetriever} 在代码层做 Hybrid 检索，拿到<b>真实库内命中</b>；</li>
 *   <li>把命中明细（真分类 / 真原文 / 分数 / 来源）经 SSE <code>recall</code> 事件<b>原样</b>推前端——
 *       让用户看得见“我据什么回答”，不靠模型转述；</li>
 *   <li>零命中 → 代码<b>直接</b>回“没有找到相关记录”，<b>不进模型</b>（杜绝凭空编造）；</li>
 *   <li>有命中 → 把真实记录注入 {@link RecallAssistant}，模型只负责<b>组织语言</b>（不挂工具、不再检索）。</li>
 * </ol>
 */
@Service
public class RecallService {

    private static final Logger log = LoggerFactory.getLogger(RecallService.class);

    private final RecallAssistant assistant;
    private final RecallRetriever retriever;
    private final MemoryService memoryService;
    private final MemoryContextBuilder memoryContext;
    private final BoundaryGuard boundaryGuard;

    public RecallService(RecallAssistant assistant, RecallRetriever retriever,
                         MemoryService memoryService, MemoryContextBuilder memoryContext,
                         BoundaryGuard boundaryGuard) {
        this.assistant = assistant;
        this.retriever = retriever;
        this.memoryService = memoryService;
        this.memoryContext = memoryContext;
        this.boundaryGuard = boundaryGuard;
    }

    public void ask(String question, SseEmitter emitter) {
        if (!StringUtils.hasText(question)) {
            sendError(emitter, "问题不能为空");
            return;
        }
        String q = question.trim();
        Thread.ofVirtual().start(() -> {
            try {
                // ① 代码确定性检索
                List<RecallHit> hits = retriever.retrieve(q);

                // ② 召回明细原样推前端（真实库内记录，非模型转述）
                send(emitter, "recall", Map.of("hits", toHitViews(hits)));

                // ③ 零命中：代码直接作答，不进模型
                if (hits.isEmpty()) {
                    send(emitter, "answer", Map.of("text", "没有找到与你的问题相关的记录。"));
                    sendDone(emitter);
                    return;
                }

                // ④ 有命中：模型只据真实记录组织语言（注入用户背景）
                String records = buildRecordsBlock(hits);
                String now = CaptureNormalizer.nowContext(ZonedDateTime.now());
                String answer = assistant.answer(now, memoryContext.build(), records, q);
                // 禁区出参拦截（红线兜底；当前直通，Phase 2 实现）
                answer = boundaryGuard.review(answer == null ? "" : answer);

                send(emitter, "answer", Map.of("text", answer));
                sendDone(emitter);

                // 答完异步从「问题 + 回答」提炼长期记忆（LLM 提议→proposed），不阻塞本次回忆
                final String spoken = answer == null ? "" : answer;
                Thread.ofVirtual().start(() -> memoryService.proposeFrom(q + "\n" + spoken));
            } catch (Exception e) {
                log.warn("[ai-secretary] 回忆态执行失败", e);
                sendError(emitter, e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
            }
        });
    }

    /** 命中 → 前端可视化视图（真分类 + 原文 + 分数 + 来源 + 时间）。 */
    private List<Map<String, Object>> toHitViews(List<RecallHit> hits) {
        List<Map<String, Object>> views = new ArrayList<>(hits.size());
        for (RecallHit h : hits) {
            Map<String, Object> v = new HashMap<>();
            v.put("category", h.note().category().name());
            v.put("categoryLabel", h.note().category().label());
            v.put("text", h.note().rawText());
            v.put("score", h.score()); // 可能为 null（关键字精确命中无分数）
            v.put("source", h.source());
            v.put("createdAt", h.note().createdAt());
            views.add(v);
        }
        return views;
    }

    /** 注入模型的真实记录块：编号 + [分类] + 原文。 */
    private String buildRecordsBlock(List<RecallHit> hits) {
        StringBuilder sb = new StringBuilder();
        int i = 1;
        for (RecallHit h : hits) {
            sb.append(i++).append(". [").append(h.note().category().label()).append("] ")
                    .append(h.note().rawText()).append('\n');
        }
        return sb.toString();
    }

    private void send(SseEmitter emitter, String event, Object data) {
        try {
            emitter.send(SseEmitter.event().name(event).data(data));
        } catch (Exception e) {
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

    private void sendError(SseEmitter emitter, String message) {
        try {
            emitter.send(SseEmitter.event().name("error").data(Map.of("message", "回忆失败：" + message)));
            emitter.complete();
        } catch (Exception e) {
            emitter.completeWithError(e);
        }
    }
}
