package com.exceptioncoder.forge.quality.application;

import com.exceptioncoder.forge.quality.core.ChangeSet;
import com.exceptioncoder.forge.quality.core.Finding;
import com.exceptioncoder.forge.quality.core.GateStatus;
import com.exceptioncoder.forge.quality.core.QualityEngine;
import com.exceptioncoder.forge.quality.core.QualityReport;
import com.exceptioncoder.forge.quality.core.Severity;
import com.exceptioncoder.forge.quality.runtime.RuntimeScenario;
import com.exceptioncoder.forge.quality.runtime.RuntimeStatus;
import com.exceptioncoder.forge.quality.runtime.RuntimeVerificationEngine;
import com.exceptioncoder.forge.quality.runtime.RuntimeVerificationReport;
import com.exceptioncoder.forge.quality.runtime.RuntimeVerificationResult;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.function.Supplier;

/** Enforces static-first short-circuiting and produces the two-phase report. */
final class VerificationOrchestrator {
    private final QualityEngine staticEngine;
    private final RuntimeVerificationEngine runtimeEngine;

    VerificationOrchestrator(QualityEngine staticEngine, RuntimeVerificationEngine runtimeEngine) {
        this.staticEngine = staticEngine;
        this.runtimeEngine = runtimeEngine;
    }

    VerificationReport verifyStatic(ChangeSet changeSet, Set<String> capabilities) {
        return report(staticEngine.check(changeSet, capabilities), null, "SKIPPED");
    }

    VerificationReport verifyRuntime(List<RuntimeScenario> scenarios) {
        RuntimeVerificationReport runtimeReport = runtimeEngine.verify(scenarios);
        return report(null, runtimeReport, runtimeReport.status().name());
    }

    VerificationReport verifyAll(ChangeSet changeSet, Set<String> capabilities,
                                 Supplier<List<RuntimeScenario>> scenarios) {
        QualityReport staticReport = staticEngine.check(changeSet, capabilities);
        if (staticReport.status() == GateStatus.FAILED) {
            return report(staticReport, null, "SKIPPED");
        }
        RuntimeVerificationReport runtimeReport = runtimeEngine.verify(scenarios.get());
        return report(staticReport, runtimeReport, runtimeReport.status().name());
    }

    private static VerificationReport report(QualityReport staticReport,
                                             RuntimeVerificationReport runtimeReport,
                                             String runtimeStatus) {
        String staticStatus = staticReport == null ? "SKIPPED" : staticReport.status().name();
        String status = isFailed(staticReport, runtimeReport) ? "FAILED" : "PASSED";
        return new VerificationReport(status, staticStatus, runtimeStatus, staticReport,
                runtimeReport, issues(staticReport, runtimeReport));
    }

    private static boolean isFailed(QualityReport staticReport, RuntimeVerificationReport runtimeReport) {
        return staticReport != null && staticReport.status() == GateStatus.FAILED
                || runtimeReport != null && runtimeReport.status() == RuntimeStatus.FAILED;
    }

    private static List<VerificationIssue> issues(QualityReport staticReport,
                                                  RuntimeVerificationReport runtimeReport) {
        List<VerificationIssue> issues = new ArrayList<>();
        if (staticReport != null) {
            staticReport.findings().stream().filter(finding -> finding.severity() == Severity.ERROR)
                    .map(VerificationOrchestrator::staticIssue).forEach(issues::add);
        }
        if (runtimeReport != null) {
            runtimeReport.results().stream().filter(result -> result.status() == RuntimeStatus.FAILED)
                    .map(VerificationOrchestrator::runtimeIssue).forEach(issues::add);
        }
        return issues;
    }

    private static VerificationIssue staticIssue(Finding finding) {
        return new VerificationIssue("static", finding.ruleId(), "", finding.message(), finding.evidence());
    }

    private static VerificationIssue runtimeIssue(RuntimeVerificationResult result) {
        return new VerificationIssue("runtime", result.ruleId(), result.scenarioId(),
                result.message(), result.evidence());
    }
}
