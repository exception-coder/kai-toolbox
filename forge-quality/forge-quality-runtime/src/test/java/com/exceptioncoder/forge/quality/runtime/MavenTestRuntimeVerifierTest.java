package com.exceptioncoder.forge.quality.runtime;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class MavenTestRuntimeVerifierTest {
    @TempDir Path root;

    @Test
    void acceptsOnlyCurrentSuccessfulReports() throws Exception {
        report("old", 99, 0, 0, 0);
        assertFalse(SurefireEvidence.read(List.of(root), "new").passed());
        report("new", 3, 0, 0, 1);
        var evidence = SurefireEvidence.read(List.of(root), "new");
        assertTrue(evidence.passed());
        assertEquals(3, evidence.tests());
    }

    @Test
    void rejectsFailuresErrorsAndAllSkipped() throws Exception {
        report("failed", 3, 1, 0, 0);
        report("errors", 3, 0, 1, 0);
        report("skipped", 3, 0, 0, 3);
        for (String suffix : List.of("failed", "errors", "skipped", "missing")) {
            assertFalse(SurefireEvidence.read(List.of(root), suffix).passed());
        }
    }

    @Test
    void rejectsExternalXmlEntities() throws Exception {
        Path reports = Files.createDirectories(root.resolve("target/surefire-reports"));
        Files.writeString(reports.resolve("TEST-A-xxe.xml"),
                "<!DOCTYPE testsuite SYSTEM 'file:///unavailable'><testsuite tests='1'/>");
        assertThrows(Exception.class, () -> SurefireEvidence.read(List.of(root), "xxe"));
    }

    @Test
    void validatesModulesAndTestSelectors() throws Exception {
        Files.writeString(root.resolve("pom.xml"), "<project/>");
        RuntimeScenario valid = scenario(".", "*Test,!ExternalTest", 30);
        assertEquals(root.toRealPath(), MavenTestPlan.from(valid).modules().getFirst());
        assertThrows(IllegalArgumentException.class, () -> MavenTestPlan.from(scenario("..", "*Test", 30)));
        assertThrows(IllegalArgumentException.class, () -> MavenTestPlan.from(scenario(".", "test;deploy", 30)));
        assertThrows(IllegalArgumentException.class, () -> MavenTestPlan.from(scenario(".", "*Test", 1201)));
    }

    @Test
    void invalidConfigurationReturnsFailure() {
        var result = new MavenTestRuntimeVerifier().verify(new RuntimeScenario("local", "maven-test", Map.of()));
        assertEquals(RuntimeStatus.FAILED, result.status());
    }

    @Test
    void commandUsesPortableClasspathAndDisablesBuildCache() {
        var command = new MavenTestPlan(root, List.of(root), "*Test", 30).command(root, "current");
        assertTrue(command.contains(root.resolve("boot") + java.io.File.separator + "*"));
        assertTrue(command.contains("-Dmaven.build.cache.enabled=false"));
        assertTrue(command.contains("-Dsurefire.reportNameSuffix=current"));
        assertEquals(".", command.get(command.indexOf("-pl") + 1));
    }

    @Test
    void processFailureCannotReusePassingReportAndTimeoutStopsExecution() throws Exception {
        report("current", 1, 0, 0, 0);
        var verifier = new MavenTestRuntimeVerifier();
        // Windows can briefly retain a terminated process's cwd; reports still use the isolated fixture.
        var plan = new MavenTestPlan(Path.of("").toAbsolutePath(), List.of(root), "*Test", 1);
        var scenario = scenario(".", "*Test", 1);
        var failed = verifier.execute(scenario, plan, fixture("fail"), "current", System.nanoTime());
        assertEquals(RuntimeStatus.FAILED, failed.status());
        assertTrue(failed.message().contains("exited with"));
        var timeout = verifier.execute(scenario, plan, fixture("wait"), "current", System.nanoTime());
        assertEquals(RuntimeStatus.FAILED, timeout.status());
        assertTrue(timeout.message().contains("timed out"));
    }

    private List<String> fixture(String mode) throws Exception {
        Path java = Path.of(System.getProperty("java.home"), "bin",
                System.getProperty("os.name").startsWith("Windows") ? "java.exe" : "java");
        String classes = Path.of(ProcessFixture.class.getProtectionDomain().getCodeSource()
                .getLocation().toURI()).toString();
        return List.of(java.toString(), "-cp", classes, ProcessFixture.class.getName(), mode);
    }

    public static class ProcessFixture {
        public static void main(String[] args) throws Exception {
            if (args[0].equals("wait")) {
                Thread.sleep(60000);
            }
            System.exit(9);
        }
    }

    private RuntimeScenario scenario(String module, String tests, int timeout) {
        return new RuntimeScenario("local", "maven-test", Map.of("projectRoot", root.toString(),
                "modules", List.of(module), "tests", tests, "timeoutSeconds", timeout));
    }

    private void report(String suffix, int tests, int failures, int errors, int skipped) throws Exception {
        Path reports = Files.createDirectories(root.resolve("target/surefire-reports"));
        Files.writeString(reports.resolve("TEST-A-" + suffix + ".xml"),
                "<testsuite tests='%d' failures='%d' errors='%d' skipped='%d'/>"
                        .formatted(tests, failures, errors, skipped));
    }
}
