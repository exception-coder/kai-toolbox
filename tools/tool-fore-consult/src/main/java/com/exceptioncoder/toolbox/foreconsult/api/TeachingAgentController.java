package com.exceptioncoder.toolbox.foreconsult.api;

import com.exceptioncoder.toolbox.common.auth.annotation.RequireRole;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingAgentExecutor;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingConfig;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingEvaluation;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingRequest;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingRun;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingScenario;
import com.exceptioncoder.toolbox.foreconsult.repository.TeachingAgentRepository;
import com.exceptioncoder.toolbox.foreconsult.service.TeachingAgentConfigurationService;
import com.exceptioncoder.toolbox.foreconsult.service.TeachingAgentRunService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 既有 Agent 管理下的教学能力，继承同等管理员权限。 */
@RestController
@RequireRole("ADMIN")
@RequestMapping("/api/fore-consult/agents/order-draft-teaching/teaching")
public class TeachingAgentController {
    private final TeachingAgentConfigurationService configurations;
    private final TeachingAgentRunService runs;
    private final TeachingAgentRepository repository;
    private final TeachingAgentExecutor executor;

    public TeachingAgentController(TeachingAgentConfigurationService configurations, TeachingAgentRunService runs,
                                   TeachingAgentRepository repository, TeachingAgentExecutor executor) {
        this.configurations = configurations;
        this.runs = runs;
        this.repository = repository;
        this.executor = executor;
    }

    @GetMapping
    public Snapshot get(@RequestParam(required = false) Long version) {
        long selected = version == null ? configurations.latestVersion() : version;
        return new Snapshot(selected, configurations.config(selected), executor.liveAvailable(),
                TeachingScenario.all(), repository.runs(), repository.evaluations());
    }

    @PostMapping("/versions")
    public Snapshot save(@RequestBody TeachingConfig config) {
        return get(configurations.save(config));
    }

    @PostMapping("/runs")
    public TeachingRun run(@RequestBody TeachingRequest request) {
        return runs.run(request);
    }

    @PostMapping("/evaluations")
    public TeachingEvaluation evaluate(@RequestBody EvaluationRequest request) {
        if (request.version() == null || (!"DEMO".equals(request.mode()) && !"LIVE".equals(request.mode()))) {
            throw new IllegalArgumentException("请选择版本和运行模式");
        }
        return runs.evaluate(request.version(), request.mode());
    }

    /** 教学详情不包含任何凭据。 */
    public record Snapshot(
            /** 配置版本。 */ Long version,
            /** 配置快照。 */ TeachingConfig config,
            /** 网关是否配置。 */ Boolean liveAvailable,
            /** 固定样本。 */ List<TeachingScenario> scenarios,
            /** 最近二十次运行。 */ List<TeachingRun> runs,
            /** 最近二十次评测。 */ List<TeachingEvaluation> evaluations) {
    }

    /** 评分标准由服务端决定。 */
    public record EvaluationRequest(/** 版本。 */ Long version, /** 模式。 */ String mode) {
    }
}
