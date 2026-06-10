package com.exceptioncoder.toolbox.aisecretary.service;

import com.exceptioncoder.toolbox.aisecretary.ai.RecallAssistant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.ZonedDateTime;
import java.util.Map;

/**
 * 回忆态编排：在虚拟线程里跑 AiServices 的 tool-loop，把每步工具调用经 SSE 实时推前端，
 * 最后推最终答案。step 事件靠 {@link RecallContext}（ThreadLocal sink）从工具里冒泡上来。
 */
@Service
public class RecallService {

    private static final Logger log = LoggerFactory.getLogger(RecallService.class);

    private final RecallAssistant assistant;

    public RecallService(RecallAssistant assistant) {
        this.assistant = assistant;
    }

    public void ask(String question, SseEmitter emitter) {
        if (!StringUtils.hasText(question)) {
            sendError(emitter, "问题不能为空");
            return;
        }
        Thread.ofVirtual().start(() -> {
            try {
                // tool-loop 同步跑在本线程：把 step sink 挂上，工具调用即经 SSE 冒泡
                RecallContext.set(step -> send(emitter, "step", Map.of(
                        "tool", step.tool(),
                        "args", step.args() == null ? "" : step.args(),
                        "result", step.result() == null ? "" : step.result())));

                ZonedDateTime now = ZonedDateTime.now();
                String answer = assistant.ask(CaptureNormalizer.nowContext(now), question.trim());

                send(emitter, "answer", Map.of("text", answer == null ? "" : answer));
                sendDone(emitter);
            } catch (Exception e) {
                log.warn("[ai-secretary] 回忆态执行失败", e);
                sendError(emitter, e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
            } finally {
                RecallContext.clear();
            }
        });
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
