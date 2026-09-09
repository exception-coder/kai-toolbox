package com.exceptioncoder.forge.quality.core;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class QualityEngineTest {
    @TempDir
    Path project;

    @Test
    void routesCheckerByCapability() {
        QualityPlugin plugin = plugin(
                context -> List.of(new StackCapability("sample.stack", "Sample", List.of("pom.xml"))),
                checker(Set.of("sample.stack"), List.of())
        );

        QualityReport report = new QualityEngine(List.of(plugin)).check(new ChangeSet(project, List.of()));

        assertEquals(GateStatus.PASSED, report.status());
        assertEquals(List.of("TEST-001"), report.executedCheckers());
    }

    @Test
    void isolatesCheckerFailureAsBlockingFinding() {
        QualityChecker checker = checker(Set.of(), null);
        QualityReport report = new QualityEngine(List.of(plugin(context -> List.of(), checker)))
                .check(new ChangeSet(project, List.of()));

        assertEquals(GateStatus.FAILED, report.status());
        assertTrue(report.findings().getFirst().message().contains("Checker execution failed"));
    }

    private static QualityPlugin plugin(DetectorFunction detector, QualityChecker checker) {
        return new QualityPlugin() {
            public String id() { return "test-plugin"; }
            public List<StackDetector> detectors() {
                return List.of(new StackDetector() {
                    public String id() { return "test-detector"; }
                    public List<StackCapability> detect(DetectionContext context) { return detector.detect(context); }
                });
            }
            public List<QualityChecker> checkers() { return List.of(checker); }
        };
    }

    private static QualityChecker checker(Set<String> required, List<Finding> result) {
        return new QualityChecker() {
            public String id() { return "TEST-001"; }
            public String domain() { return "Test"; }
            public Set<String> requiredCapabilities() { return required; }
            public List<Finding> check(ChangeSet changeSet, List<StackCapability> capabilities) {
                if (result == null) { throw new IllegalStateException("boom"); }
                return result;
            }
        };
    }

    @FunctionalInterface
    private interface DetectorFunction {
        List<StackCapability> detect(DetectionContext context);
    }
}
