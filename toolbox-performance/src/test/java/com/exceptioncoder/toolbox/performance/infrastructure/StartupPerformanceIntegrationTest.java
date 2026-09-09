package com.exceptioncoder.toolbox.performance.infrastructure;

import com.exceptioncoder.toolbox.performance.api.StartupPerformanceController;
import com.exceptioncoder.toolbox.performance.application.StartupTelemetry;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.assertThat;

/** 启动真实嵌入式 HTTP 服务，验证快照、首次成功和磁盘报告关联。 */
class StartupPerformanceIntegrationTest {

    @TempDir
    Path temporary;

    @Test
    void measuresRealStartupAndExcludesDiagnosticRequests() throws Exception {
        Path report = temporary.resolve("runtime.json");
        System.setProperty("toolbox.performance.report-path", report.toString());
        System.setProperty("toolbox.performance.run-id", "integration-run");
        System.setProperty("toolbox.performance.build-scope", "maven-before-jvm");
        System.setProperty("toolbox.performance.build-started-at", Long.toString(
                java.lang.management.ManagementFactory.getRuntimeMXBean().getStartTime() - 12345));
        try {
            var application = new SpringApplication(TestApplication.class);
            new StartupPerformanceBootstrap().configure(application);
            try (var context = (ServletWebServerApplicationContext) application.run(
                    "--server.port=0", "--spring.main.banner-mode=off")) {
                var telemetry = context.getBean(StartupTelemetry.class);
                assertThat(telemetry.snapshot().milestones().get("applicationReady").status()).isEqualTo("COMPLETED");
                String base = "http://127.0.0.1:" + context.getWebServer().getPort();
                var response = get(base + "/api/performance/startup");
                assertThat(response.statusCode()).isEqualTo(200);
                var build = new ObjectMapper().readTree(response.body()).get("build");
                assertThat(build.get("scope").asText()).isEqualTo("maven-before-jvm");
                assertThat(build.get("durationMs").asLong()).isEqualTo(12345);
                assertThat(telemetry.snapshot().milestones().get("firstApiSuccess").elapsedMs()).isNull();
                int captured = telemetry.snapshot().capturedStepCount();
                assertThat(telemetry.snapshot().capturedStepCount()).isGreaterThanOrEqualTo(captured);
                assertThat(get(base + "/api/example/123?secret=hidden").statusCode()).isEqualTo(200);
                var first = telemetry.snapshot().milestones().get("firstApiSuccess");
                assertThat(first.status()).isEqualTo("COMPLETED");
                assertThat(first.source()).isEqualTo("GET /api/example/{id}");
                assertThat(telemetry.snapshot().slowestSteps()).hasSizeLessThanOrEqualTo(100);
                var json = new ObjectMapper().readTree(report.toFile());
                assertThat(json.get("runId").asText()).isEqualTo("integration-run");
                assertThat(json.toString()).doesNotContain("hidden", "?secret");
            }
        } finally {
            System.clearProperty("toolbox.performance.report-path");
            System.clearProperty("toolbox.performance.run-id");
            System.clearProperty("toolbox.performance.build-scope");
            System.clearProperty("toolbox.performance.build-started-at");
        }
    }

    private HttpResponse<String> get(String url) throws Exception {
        try (var client = HttpClient.newHttpClient()) {
            return client.send(HttpRequest.newBuilder(URI.create(url)).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
        }
    }

    @SpringBootConfiguration
    @EnableAutoConfiguration
    @Import({StartupPerformanceController.class, StartupApiObservationConfiguration.class, ExampleController.class})
    static class TestApplication {
    }

    @RestController
    static class ExampleController {

        @GetMapping("/api/example/{id}")
        String example() {
            return "ok";
        }
    }
}
