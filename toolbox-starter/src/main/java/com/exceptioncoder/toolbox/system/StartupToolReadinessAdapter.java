package com.exceptioncoder.toolbox.system;

import com.exceptioncoder.toolbox.common.media.FfmpegProbe;
import com.exceptioncoder.toolbox.magnet.config.MagnetProperties;
import com.exceptioncoder.toolbox.magnet.service.Aria2DaemonManager;
import com.exceptioncoder.toolbox.performance.application.StartupTelemetry;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/** 宿主组合根适配已存在的工具状态，治理模块不依赖工具实现。 */
@Component
public class StartupToolReadinessAdapter {

    private final StartupTelemetry telemetry;
    private final FfmpegProbe ffmpeg;
    private final Aria2DaemonManager aria2;
    private final MagnetProperties magnet;

    public StartupToolReadinessAdapter(StartupTelemetry telemetry, FfmpegProbe ffmpeg,
                                       Aria2DaemonManager aria2, MagnetProperties magnet) {
        this.telemetry = telemetry;
        this.ffmpeg = ffmpeg;
        this.aria2 = aria2;
        this.magnet = magnet;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Order(Ordered.LOWEST_PRECEDENCE - 1)
    public void observeTools() {
        telemetry.recording().observeTool("ffmpeg", ffmpeg.isFfmpegAvailable() ? "COMPLETED" : "FAILED");
        String aria2Status = !magnet.isEnabled() ? "SKIPPED" : aria2.isReady() ? "COMPLETED" : "FAILED";
        telemetry.recording().observeTool("aria2", aria2Status);
        telemetry.recording().observeTool("rag-backfill", "NOT_OBSERVED");
    }
}
