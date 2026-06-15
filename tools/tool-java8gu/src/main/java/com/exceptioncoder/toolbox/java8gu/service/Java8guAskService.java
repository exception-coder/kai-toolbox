package com.exceptioncoder.toolbox.java8gu.service;

import com.exceptioncoder.toolbox.java8gu.ai.Java8guAssistant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 八股复习问答编排（确定性优先 / 召回可见，与个人秘书回忆态同构）：
 * 代码检索真实卡片 → SSE {@code recall} 原样推命中明细 → 零命中代码直接答、不进模型 →
 * 有命中才让 {@link Java8guAssistant} 据真实卡片组织复习作答。
 */
@Service
public class Java8guAskService {

    private static final Logger log = LoggerFactory.getLogger(Java8guAskService.class);

    /** 注入模型的单卡正文上限，防止 6 张卡片正文把上下文撑爆。 */
    private static final int CARD_BODY_LIMIT = 1200;

    private final Java8guRagService rag;
    private final Java8guAssistant assistant;

    public Java8guAskService(Java8guRagService rag, Java8guAssistant assistant) {
        this.rag = rag;
        this.assistant = assistant;
    }

    public void ask(String question, String categoryId, SseEmitter emitter) {
        if (!StringUtils.hasText(question)) {
            sendError(emitter, "问题不能为空");
            return;
        }
        String q = question.trim();
        Thread.ofVirtual().start(() -> {
            try {
                List<CardHit> hits = rag.retrieve(q, categoryId);
                send(emitter, "recall", Map.of("hits", toHitViews(hits)));

                if (hits.isEmpty()) {
                    boolean enabled = rag.isEnabled();
                    send(emitter, "answer", Map.of("text",
                            enabled ? "题库里暂无与你的问题相关的卡片。"
                                    : "向量库未就绪（RAG 未启用或未入库），无法检索八股卡片。"));
                    sendDone(emitter);
                    return;
                }

                String cards = buildCardsBlock(hits);
                String answer = assistant.answer(cards, q);
                send(emitter, "answer", Map.of("text", answer == null ? "" : answer));
                sendDone(emitter);
            } catch (Exception e) {
                log.warn("[java8gu] 复习问答失败", e);
                sendError(emitter, e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
            }
        });
    }

    private List<Map<String, Object>> toHitViews(List<CardHit> hits) {
        List<Map<String, Object>> views = new ArrayList<>(hits.size());
        for (CardHit h : hits) {
            Map<String, Object> v = new HashMap<>();
            v.put("id", h.id());
            v.put("categoryLabel", h.categoryLabel());
            v.put("title", h.title());
            v.put("score", h.score());
            v.put("snippet", snippet(h.text(), 220));
            views.add(v);
        }
        return views;
    }

    private String buildCardsBlock(List<CardHit> hits) {
        StringBuilder sb = new StringBuilder();
        int i = 1;
        for (CardHit h : hits) {
            sb.append(i++).append(". [").append(h.categoryLabel()).append("] ")
                    .append(h.title()).append('\n')
                    .append(snippet(h.text(), CARD_BODY_LIMIT)).append("\n\n");
        }
        return sb.toString();
    }

    private String snippet(String s, int limit) {
        if (s == null) {
            return "";
        }
        String t = s.strip();
        return t.length() <= limit ? t : t.substring(0, limit) + "…";
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
            emitter.send(SseEmitter.event().name("error").data(Map.of("message", "复习问答失败：" + message)));
            emitter.complete();
        } catch (Exception e) {
            emitter.completeWithError(e);
        }
    }
}
