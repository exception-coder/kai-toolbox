package com.exceptioncoder.forge.quality.runtime;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import java.util.List;
import java.util.concurrent.TimeUnit;

/** Executes local development tests without starting an application or database service. */
public final class MavenTestRuntimeVerifier implements RuntimeVerifier {
    @Override
    public String id() {
        return "maven-test";
    }

    @Override
    public boolean supports(String scenarioType) {
        return "maven-test".equals(scenarioType);
    }

    @Override
    public RuntimeVerificationResult verify(RuntimeScenario scenario) {
        long started = System.nanoTime();
        try {
            MavenTestPlan plan = MavenTestPlan.from(scenario);
            String suffix = "forge-" + UUID.randomUUID();
            return execute(scenario, plan, plan.command(suffix), suffix, started);
        } catch (Exception exception) {
            return result(scenario, started, false, "Invalid local Maven configuration",
                    exception.getMessage());
        }
    }

    RuntimeVerificationResult execute(RuntimeScenario scenario, MavenTestPlan plan,
            List<String> command, String suffix, long started) {
        Path output = null;
        Process process = null;
        try {
            output = Files.createTempFile("forge-maven-test-", ".log");
            process = new ProcessBuilder(command).directory(plan.root().toFile())
                    .redirectErrorStream(true).redirectOutput(output.toFile()).start();
            if (!process.waitFor(plan.timeoutSeconds(), TimeUnit.SECONDS)) {
                return result(scenario, started, false, "Local Maven test timed out", "");
            }
            if (process.exitValue() != 0) {
                return result(scenario, started, false,
                        "Local Maven test exited with " + process.exitValue(), "Review project test reports");
            }
            for (Path module : plan.modules()) {
                if (!SurefireEvidence.read(List.of(module), suffix).passed()) {
                    return result(scenario, started, false,
                            "Module has no successful fresh test evidence", plan.root().relativize(module).toString());
                }
            }
            SurefireEvidence evidence = SurefireEvidence.read(plan.modules(), suffix);
            return result(scenario, started, evidence.passed(), evidence.passed()
                    ? "Local tests passed; production verification not performed"
                    : "No successful fresh test evidence, or tests failed", evidence.toString());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return result(scenario, started, false, "Local Maven test interrupted", "");
        } catch (Exception exception) {
            return result(scenario, started, false, "Local Maven verification failed: "
                    + exception.getClass().getSimpleName(), exception.getMessage());
        } finally {
            if (process != null && process.isAlive()) {
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
                try {
                    process.waitFor(5, TimeUnit.SECONDS);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                }
            }
            if (output != null) {
                try {
                    Files.deleteIfExists(output);
                } catch (java.io.IOException ignored) {
                    // A terminating child may briefly retain the temporary log on Windows.
                    output.toFile().deleteOnExit();
                }
            }
        }
    }

    private RuntimeVerificationResult result(RuntimeScenario scenario, long started, boolean passed,
            String message, String evidence) {
        return new RuntimeVerificationResult("MAVEN-001", scenario.id(), scenario.type(),
                passed ? RuntimeStatus.PASSED : RuntimeStatus.FAILED,
                TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started), message, evidence);
    }
}
