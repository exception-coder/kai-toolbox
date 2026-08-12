package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.service.orchestration.ConsultOrchestrationPipeline;
import com.exceptioncoder.toolbox.foreconsult.service.orchestration.ConsultOrchestrationRequest;
import com.exceptioncoder.toolbox.foreconsult.service.orchestration.ConsultOrchestrationResult;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.llm.spi.BusinessConsultEvaluationRunner;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import java.util.List;

/** Runs the same versioned consultation prompt and read-only tool policy used by production. */
@Component
public class DefaultBusinessConsultEvaluationRunner implements BusinessConsultEvaluationRunner {

    private final ConsultOrchestrationPipeline pipeline;
    private final ObjectProvider<AgentOneShotRunner> runnerProvider;

    public DefaultBusinessConsultEvaluationRunner(ConsultOrchestrationPipeline pipeline,
                                                  ObjectProvider<AgentOneShotRunner> runnerProvider) {
        this.pipeline = pipeline;
        this.runnerProvider = runnerProvider;
    }

    @Override
    public Result run(Input input) {
        if (input.question() == null || input.question().isBlank()) {
            throw new IllegalArgumentException("业务咨询评测问题不能为空");
        }
        if (input.sourcePath() == null || input.sourcePath().isBlank()) {
            throw new IllegalArgumentException("业务咨询评测需要 sessionContext.sourcePath，以便只读工具定位系统");
        }
        ConsultOrchestrationResult orchestration = pipeline.orchestrate(new ConsultOrchestrationRequest(
                input.question(), input.system(), input.sourcePath(),
                input.modules() == null ? List.of() : input.modules(), input.role(), false,
                "离线评测不扩展未确认的跨系统证据路由。"), input.orchestrationVersion());
        AgentOneShotRunner runner = runnerProvider.getIfAvailable();
        if (runner == null) {
            throw new IllegalStateException("AgentOneShotRunner 不可用，无法执行业务咨询评测");
        }
        long startedAt = System.currentTimeMillis();
        AgentOneShotRunner.ObservedResult observed = runner.runObserved(new AgentOneShotRunner.ExecutionRequest(
                orchestration.prompt(), input.question(), input.sourcePath(), input.model(),
                normalizeEngine(input.engine()), input.reasoningEffort(), input.speed(),
                null, null, input.codexHome(), AgentOneShotRunner.TOOL_POLICY_CONSULT_READONLY));
        return new Result(observed.text(), observed.traceId(), observed.evidence(), observed.trajectory(),
                System.currentTimeMillis() - startedAt);
    }

    private static String normalizeEngine(String engine) {
        return engine == null || engine.isBlank() ? "codex" : engine;
    }
}
