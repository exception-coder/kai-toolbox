package com.exceptioncoder.toolbox.performance.infrastructure;

import com.exceptioncoder.toolbox.performance.application.StartupTelemetry;
import com.exceptioncoder.toolbox.performance.domain.StartupRecording;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.metrics.buffering.BufferingApplicationStartup;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerMapping;
import static org.assertj.core.api.Assertions.assertThat;

/** 验证异常、异步及未就绪请求不会污染首次业务响应。 */
class StartupApiObservationConfigurationTest {

    @Test
    void rejectsFailedAsyncUnreadyAndHealthRequests() throws Exception {
        var recording = new StartupRecording("test", () -> 100L);
        var telemetry = new StartupTelemetry(recording, new BufferingApplicationStartup(2048));
        var configuration = new StartupApiObservationConfiguration(telemetry, new StartupReportWriter(null));
        var request = new MockHttpServletRequest("GET", "/api/example");
        request.setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, "/api/example");
        var response = new MockHttpServletResponse();
        var handler = new HandlerMethod(this, getClass().getDeclaredMethod("endpoint"));
        configuration.observe(request, response, handler, null);
        assertThat(recording.milestones().get("firstApiSuccess").elapsedMs()).isNull();
        recording.complete("applicationReady", "test");
        response.setStatus(500);
        configuration.observe(request, response, handler, null);
        response.setStatus(200);
        configuration.observe(request, response, handler, new IllegalStateException("failed"));
        request.setAsyncStarted(true);
        configuration.observe(request, response, handler, null);
        request.setAsyncStarted(false);
        request.setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, "/api/tools/health");
        configuration.observe(request, response, handler, null);
        assertThat(recording.milestones().get("firstApiSuccess").elapsedMs()).isNull();
        request.setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, "/api/example");
        configuration.observe(request, response, handler, null);
        assertThat(recording.milestones().get("firstApiSuccess").source()).isEqualTo("GET /api/example");
    }

    String endpoint() {
        return "ok";
    }

    @Test
    void boundsStepsAndDropsUnapprovedTagsWithoutDraining() {
        var startup = new BufferingApplicationStartup(StartupTelemetry.STEP_CAPACITY);
        for (int index = 0; index < 2100; index++) {
            startup.start("test").tag("secret", "private").tag("beanName", "testBean").end();
        }
        var telemetry = new StartupTelemetry(new StartupRecording("test", () -> 1L), startup);
        assertThat(telemetry.snapshot().stepsPossiblyTruncated()).isTrue();
        assertThat(telemetry.snapshot().capturedStepCount()).isEqualTo(2048);
        assertThat(telemetry.snapshot().slowestSteps()).hasSize(100)
                .allSatisfy(step -> assertThat(step.tags()).containsOnlyKeys("beanName"));
        assertThat(telemetry.snapshot().capturedStepCount()).isEqualTo(2048);
    }
}
