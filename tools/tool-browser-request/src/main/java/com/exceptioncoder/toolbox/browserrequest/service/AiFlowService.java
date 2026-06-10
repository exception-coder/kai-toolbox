package com.exceptioncoder.toolbox.browserrequest.service;

import com.exceptioncoder.toolbox.browserrequest.ai.FlowScriptAssistant;
import com.exceptioncoder.toolbox.browserrequest.api.dto.GenerateFlowRequest;
import com.exceptioncoder.toolbox.browserrequest.config.BrowserSessionManager;
import com.exceptioncoder.toolbox.browserrequest.config.UndetectedBrowserSidecar;
import com.exceptioncoder.toolbox.browserrequest.domain.AiFlow;
import com.exceptioncoder.toolbox.browserrequest.domain.BrowserSession;
import com.exceptioncoder.toolbox.browserrequest.domain.FlowAction;
import com.exceptioncoder.toolbox.browserrequest.domain.FlowRunResult;
import com.exceptioncoder.toolbox.browserrequest.repository.AiFlowRepository;
import com.exceptioncoder.toolbox.browserrequest.repository.BrowserSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

/**
 * AI 用例编排服务：自然语言 → LLM 生成动作脚本（代码校验）→ 确定性执行 + 断言验证 → 人工确认落库。
 *
 * <p>分工严格遵循 deterministic-first：
 * <ul>
 *   <li>LLM（{@link FlowScriptAssistant}）只在"生成/重写脚本"出现，且基于真实页面快照挑选择器；</li>
 *   <li>{@link FlowActionValidator} 裁决输出是否合法；</li>
 *   <li>执行与断言（{@link UndetectedBrowserSidecar}/{@link BrowserSessionManager}）是纯确定性，
 *       脚本一旦确认即可反复回放，挂了才回到 LLM 重写。</li>
 * </ul>
 */
@Slf4j
@Service
public class AiFlowService {

    /** 页面快照里 body HTML 截断上限（字符），与 sidecar/manager 端保持一致，控制 token。 */
    private static final int SNAPSHOT_HTML_CAP = 12_000;
    private static final int DEFAULT_STEP_TIMEOUT_MS = 30_000;

    private final AiFlowRepository repo;
    private final FlowScriptAssistant assistant;
    private final FlowActionValidator validator;
    private final BrowserSessionRepository sessionRepo;
    private final BrowserSessionManager manager;
    private final UndetectedBrowserSidecar sidecar;
    private final ObjectMapper objectMapper;

    public AiFlowService(AiFlowRepository repo,
                         FlowScriptAssistant assistant,
                         FlowActionValidator validator,
                         BrowserSessionRepository sessionRepo,
                         BrowserSessionManager manager,
                         UndetectedBrowserSidecar sidecar,
                         ObjectMapper objectMapper) {
        this.repo = repo;
        this.assistant = assistant;
        this.validator = validator;
        this.sessionRepo = sessionRepo;
        this.manager = manager;
        this.sidecar = sidecar;
        this.objectMapper = objectMapper;
    }

    /** 该会话是否走 undetected-node 引擎（与 BrowserRequestService 同一判定逻辑）。 */
    private boolean isNode(BrowserSession s) {
        String e = (s == null) ? null : s.getEngine();
        if (e == null || e.isBlank()) return sidecar.enabledByDefault();
        return "undetected-node".equalsIgnoreCase(e);
    }

    private BrowserSession requireSession(String sessionId) {
        return sessionRepo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
    }

    /** 抓当前页面现场（URL/标题/截断 body），供生成时给 LLM 真实 DOM。 */
    public FlowRunResult.Snapshot snapshot(String sessionId) {
        BrowserSession s = requireSession(sessionId);
        return isNode(s) ? sidecar.snapshot(sessionId, SNAPSHOT_HTML_CAP)
                         : manager.snapshot(sessionId, SNAPSHOT_HTML_CAP);
    }

    /** 生成（或基于失败上下文重写）动作脚本。返回校验通过的脚本 + LLM 原文。 */
    public GenerateResult generate(String sessionId, GenerateFlowRequest req) {
        if (req == null || req.instruction() == null || req.instruction().isBlank()) {
            throw new IllegalArgumentException("请先填写自然语言用例");
        }
        BrowserSession s = requireSession(sessionId);
        FlowRunResult.Snapshot snap = snapshot(sessionId);
        String history = buildHistory(req);
        String raw = assistant.generate(
                snap.url() == null ? s.getUrl() : snap.url(),
                snap.html() == null ? "(无快照，请确认会话已打开)" : snap.html(),
                history,
                req.instruction());
        List<FlowAction> steps = validator.parseAndValidate(raw);
        log.info("[AiFlow] 生成脚本 session={} steps={}", sessionId, steps.size());
        return new GenerateResult(steps, raw);
    }

    /** 确定性执行脚本并返回逐步结果 + 断言裁决。 */
    public FlowRunResult run(String sessionId, List<FlowAction> steps) {
        if (steps == null || steps.isEmpty()) {
            throw new IllegalArgumentException("脚本为空，无可执行动作");
        }
        BrowserSession s = requireSession(sessionId);
        FlowRunResult result = isNode(s)
                ? sidecar.execActions(sessionId, steps, DEFAULT_STEP_TIMEOUT_MS)
                : manager.execActions(sessionId, steps, DEFAULT_STEP_TIMEOUT_MS);
        log.info("[AiFlow] 执行 session={} ok={} failedAt={}", sessionId, result.ok(), result.failedAt());
        return result;
    }

    /** 人工确认后落库。 */
    public AiFlow save(String sessionId, String name, String instruction, List<FlowAction> steps) {
        requireSession(sessionId);
        if (steps == null || steps.isEmpty()) {
            throw new IllegalArgumentException("脚本为空，无法保存");
        }
        long now = System.currentTimeMillis();
        AiFlow flow = new AiFlow(
                UUID.randomUUID().toString(),
                sessionId,
                (name == null || name.isBlank()) ? "未命名用例" : name.trim(),
                instruction,
                steps,
                now, now);
        repo.insert(flow);
        return flow;
    }

    public List<AiFlow> listBySession(String sessionId) {
        return repo.findBySessionOrderByUpdatedDesc(sessionId);
    }

    public AiFlow detail(String flowId) {
        return repo.findById(flowId)
                .orElseThrow(() -> new IllegalArgumentException("用例不存在: " + flowId));
    }

    public void delete(String flowId) {
        repo.deleteById(flowId);
    }

    /** 运行已保存用例。 */
    public FlowRunResult runSaved(String flowId) {
        AiFlow flow = detail(flowId);
        return run(flow.sessionId(), flow.steps());
    }

    /** 删除会话时级联清理其 AI 用例。 */
    public void onSessionDeleted(String sessionId) {
        repo.deleteBySession(sessionId);
    }

    /** 把上一版脚本 + 失败信息拼成给 LLM 的修正上下文。首次生成则为空提示。 */
    private String buildHistory(GenerateFlowRequest req) {
        if (req.previousSteps() == null || req.previousSteps().isEmpty()) {
            return "（首次生成，无历史）";
        }
        StringBuilder sb = new StringBuilder();
        try {
            sb.append("上一版脚本:\n")
              .append(objectMapper.writeValueAsString(req.previousSteps()))
              .append('\n');
        } catch (Exception ignored) {}
        if (req.failedAt() != null && req.failedAt() >= 0) {
            sb.append("失败步骤下标(0基): ").append(req.failedAt()).append('\n');
        }
        if (req.failureError() != null && !req.failureError().isBlank()) {
            sb.append("失败原因: ").append(req.failureError()).append('\n');
        }
        sb.append("请基于上面的真实页面快照修正选择器或步骤，重新输出完整脚本。");
        return sb.toString();
    }

    /** 生成结果：校验通过的脚本 + LLM 原始输出（供前端排查/展示）。 */
    public record GenerateResult(List<FlowAction> steps, String rawOutput) {}
}
