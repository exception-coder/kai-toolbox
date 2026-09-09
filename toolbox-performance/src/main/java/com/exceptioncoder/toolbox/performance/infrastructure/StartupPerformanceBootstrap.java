package com.exceptioncoder.toolbox.performance.infrastructure;

import com.exceptioncoder.toolbox.performance.application.StartupTelemetry;
import com.exceptioncoder.toolbox.performance.domain.StartupRecording;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.event.ApplicationFailedEvent;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.context.event.ApplicationStartedEvent;
import org.springframework.boot.context.metrics.buffering.BufferingApplicationStartup;
import org.springframework.context.ApplicationEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.core.Ordered;

import java.lang.management.ManagementFactory;
import java.nio.file.Path;
import java.util.UUID;

/** 在应用入口接线启动采集；每个上下文使用独立记录，不复用静态状态。 */
public final class StartupPerformanceBootstrap {

    private final StartupTelemetry telemetry;
    private final StartupReportWriter writer;
    private final BufferingApplicationStartup startup;

    public StartupPerformanceBootstrap() {
        String configuredId = System.getProperty("toolbox.performance.run-id", "");
        String runId = configuredId.matches("[a-zA-Z0-9-]{1,64}") ? configuredId : UUID.randomUUID().toString();
        var recording = new StartupRecording(runId, () -> ManagementFactory.getRuntimeMXBean().getUptime());
        this.startup = new BufferingApplicationStartup(StartupTelemetry.STEP_CAPACITY);
        this.telemetry = new StartupTelemetry(recording, startup,
                SupervisedBuildObservationReader.read(System.getProperties(),
                        ManagementFactory.getRuntimeMXBean().getStartTime()));
        String reportPath = System.getProperty("toolbox.performance.report-path", "");
        this.writer = new StartupReportWriter(reportPath.isBlank() ? null : Path.of(reportPath));
        recording.complete("mainEntered", "main");
    }

    public void configure(SpringApplication application) {
        startup.startRecording();
        application.setApplicationStartup(startup);
        application.addInitializers(context -> {
            context.getBeanFactory().registerSingleton("startupPerformanceTelemetry", telemetry);
            context.getBeanFactory().registerSingleton("startupPerformanceReportWriter", writer);
        });
        application.addListeners(new LifecycleListener(telemetry, writer));
        telemetry.recording().complete("springInvoked", "SpringApplication.run");
    }

    public void failedBeforeSpring() {
        telemetry.recording().fail();
        writer.write(telemetry);
    }

    /** 监听启动终态，并在 Spring ready 事件的其他同步监听器之后写入报告。 */
    private record LifecycleListener(StartupTelemetry telemetry, StartupReportWriter writer)
            implements ApplicationListener<ApplicationEvent>, Ordered {

        @Override
        public void onApplicationEvent(ApplicationEvent event) {
            if (event instanceof ApplicationStartedEvent) {
                telemetry.recording().complete("contextRefreshed", "ApplicationStartedEvent");
            } else if (event instanceof ApplicationReadyEvent) {
                telemetry.recording().complete("applicationReady", "ApplicationReadyEvent");
            } else if (event instanceof ApplicationFailedEvent) {
                telemetry.recording().fail();
            } else {
                return;
            }
            writer.write(telemetry);
        }

        @Override
        public int getOrder() {
            return Ordered.LOWEST_PRECEDENCE;
        }
    }
}
