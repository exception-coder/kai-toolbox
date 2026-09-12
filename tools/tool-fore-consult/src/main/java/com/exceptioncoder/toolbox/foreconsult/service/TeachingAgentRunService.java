package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingAgentExecutor;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingEvaluation;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingRequest;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingRun;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingScenario;
import com.exceptioncoder.toolbox.foreconsult.repository.TeachingAgentRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.Semaphore;
import org.springframework.stereotype.Service;

/** 运行与教学回归共享有界并发入口，所有成绩由服务端实际计算。 */
@Service
public class TeachingAgentRunService {
    private final TeachingAgentConfigurationService configurations;
    private final TeachingAgentRepository repository;
    private final TeachingAgentExecutor executor;
    private final Semaphore permit = new Semaphore(1);

    public TeachingAgentRunService(TeachingAgentConfigurationService configurations,
                                  TeachingAgentRepository repository, TeachingAgentExecutor executor) {
        this.configurations = configurations;
        this.repository = repository;
        this.executor = executor;
    }

    public TeachingRun run(TeachingRequest request) {
        request.validate();
        acquire();
        try {
            TeachingRun result = executor.execute(configurations.config(request.version()), request);
            repository.saveRun(result);
            return result;
        } finally {
            permit.release();
        }
    }

    public TeachingEvaluation evaluate(long version, String mode) {
        acquire();
        try {
            var config = configurations.config(version);
            List<TeachingEvaluation.CaseResult> cases = new ArrayList<>();
            for (TeachingScenario scenario : TeachingScenario.all()) {
                var request = new TeachingRequest(version, mode, scenario.id(), scenario.input(), scenario.previous());
                TeachingRun actual = executor.execute(config, request);
                cases.add(new TeachingEvaluation.CaseResult(scenario, actual, differences(scenario, actual)));
            }
            long passed = cases.stream().filter(item -> item.differences().isEmpty()).count();
            double score = passed * 100.0 / cases.size();
            var result = new TeachingEvaluation(UUID.randomUUID().toString(), version, mode, score, score >= 95,
                    List.copyOf(cases), System.currentTimeMillis());
            repository.saveEvaluation(result);
            return result;
        } finally {
            permit.release();
        }
    }

    private List<String> differences(TeachingScenario expected, TeachingRun actual) {
        List<String> differences = new ArrayList<>();
        if (!"COMPLETED".equals(actual.status()) || actual.draft() == null) {
            return List.of("执行未完成：" + actual.status());
        }
        if (!expected.expectedStatus().equals(actual.draft().status())) {
            differences.add("status：期望 " + expected.expectedStatus() + "，实际 " + actual.draft().status());
        }
        if (!Objects.equals(expected.expectedSku(), actual.draft().sku())) {
            differences.add("sku：期望 " + expected.expectedSku() + "，实际 " + actual.draft().sku());
        }
        if (!Objects.equals(expected.expectedQuantity(), actual.draft().quantity())) {
            differences.add("quantity：期望 " + expected.expectedQuantity() + "，实际 " + actual.draft().quantity());
        }
        return List.copyOf(differences);
    }

    private void acquire() {
        if (!permit.tryAcquire()) {
            throw new IllegalArgumentException("已有教学运行进行中，请完成后重试");
        }
    }
}
