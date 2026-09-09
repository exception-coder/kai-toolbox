package com.exceptioncoder.forge.quality.runtime;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.ServiceLoader;

/** Routes project scenarios to runtime verifier plugins and isolates failures. */
public final class RuntimeVerificationEngine {
    private final List<RuntimeVerifier> verifiers;
    private final Clock clock;

    /** Creates an engine with explicit verifier adapters. */
    public RuntimeVerificationEngine(List<RuntimeVerifier> verifiers) {
        this(verifiers, Clock.systemUTC());
    }

    RuntimeVerificationEngine(List<RuntimeVerifier> verifiers, Clock clock) {
        this.verifiers = verifiers.stream().sorted(Comparator.comparing(RuntimeVerifier::id)).toList();
        this.clock = clock;
    }

    /** Discovers runtime verifier adapters through the context class loader. */
    public static RuntimeVerificationEngine discover() {
        ClassLoader loader = Thread.currentThread().getContextClassLoader();
        List<RuntimeVerifier> verifiers = ServiceLoader.load(RuntimeVerifier.class, loader).stream()
                .map(ServiceLoader.Provider::get)
                .toList();
        return new RuntimeVerificationEngine(verifiers);
    }

    /** Executes every configured scenario without hiding sibling failures. */
    public RuntimeVerificationReport verify(List<RuntimeScenario> scenarios) {
        Instant startedAt = clock.instant();
        List<String> executed = new ArrayList<>();
        List<RuntimeVerificationResult> results = new ArrayList<>();
        if (scenarios.isEmpty()) {
            results.add(failed("RUNTIME-000", "configuration", "runtime", 0,
                    "No runtime scenarios are configured", "Configure .forge/verify.yml"));
        }
        for (RuntimeScenario scenario : scenarios) {
            RuntimeVerifier verifier = findVerifier(scenario.type());
            if (verifier == null) {
                results.add(failed("RUNTIME-001", scenario.id(), scenario.type(), 0,
                        "No verifier supports scenario type " + scenario.type(), "type=" + scenario.type()));
                continue;
            }
            executed.add(verifier.id());
            results.add(runSafely(verifier, scenario));
        }
        RuntimeStatus status = results.stream().anyMatch(result -> result.status() == RuntimeStatus.FAILED)
                ? RuntimeStatus.FAILED : RuntimeStatus.PASSED;
        long duration = Duration.between(startedAt, clock.instant()).toMillis();
        return new RuntimeVerificationReport(status, startedAt, duration, executed, results);
    }

    private RuntimeVerifier findVerifier(String type) {
        return verifiers.stream().filter(verifier -> verifier.supports(type)).findFirst().orElse(null);
    }

    private static RuntimeVerificationResult runSafely(RuntimeVerifier verifier, RuntimeScenario scenario) {
        try {
            return verifier.verify(scenario);
        } catch (RuntimeException exception) {
            return failed(verifier.id(), scenario.id(), scenario.type(), 0,
                    "Runtime verifier failed: " + safeMessage(exception), exception.getClass().getSimpleName());
        }
    }

    private static RuntimeVerificationResult failed(String ruleId, String scenarioId, String type,
                                                    long duration, String message, String evidence) {
        return new RuntimeVerificationResult(ruleId, scenarioId, type, RuntimeStatus.FAILED,
                duration, message, evidence);
    }

    private static String safeMessage(RuntimeException exception) {
        String message = exception.getMessage();
        return message == null || message.isBlank() ? exception.getClass().getSimpleName() : message;
    }
}
