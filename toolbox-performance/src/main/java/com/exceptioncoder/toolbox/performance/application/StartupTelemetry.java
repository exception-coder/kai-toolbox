package com.exceptioncoder.toolbox.performance.application;

import com.exceptioncoder.toolbox.performance.domain.StartupRecording;
import org.springframework.boot.context.metrics.buffering.BufferingApplicationStartup;

import java.lang.management.ManagementFactory;
import java.time.Duration;
import java.util.Comparator;
import java.util.LinkedHashMap;

/** 组织当前启动快照，不启动探测线程，不访问业务数据。 */
public final class StartupTelemetry {

    public static final int STEP_CAPACITY = 2048;
    private static final int SLOW_STEP_LIMIT = 100;
    private static final int TAG_LENGTH_LIMIT = 256;
    private final StartupRecording recording;
    private final BufferingApplicationStartup startup;
    private final StartupBuildObservation build;

    public StartupTelemetry(StartupRecording recording, BufferingApplicationStartup startup) {
        this(recording, startup, StartupBuildObservation.unmeasured());
    }

    public StartupTelemetry(StartupRecording recording, BufferingApplicationStartup startup,
                            StartupBuildObservation build) {
        this.recording = recording;
        this.startup = startup;
        this.build = build;
    }

    public StartupRecording recording() {
        return recording;
    }

    public StartupSnapshot snapshot() {
        var timeline = startup.getBufferedTimeline();
        var events = timeline.getEvents();
        var steps = events.stream().sorted(Comparator.comparing(
                org.springframework.boot.context.metrics.buffering.StartupTimeline.TimelineEvent::getDuration)
                .reversed()).limit(SLOW_STEP_LIMIT).map(event -> {
                    var step = event.getStartupStep();
                    var tags = new LinkedHashMap<String, String>();
                    for (var tag : step.getTags()) {
                        if ("beanName".equals(tag.getKey()) || "beanType".equals(tag.getKey())) {
                            String value = tag.getValue();
                            tags.put(tag.getKey(), value.substring(0, Math.min(value.length(), TAG_LENGTH_LIMIT)));
                        }
                    }
                    return new StartupSnapshot.Step(step.getId(), step.getParentId(), step.getName(),
                            event.getDuration().toNanos() / 1_000_000.0,
                            Duration.between(timeline.getStartTime(), event.getStartTime()).toMillis(), tags);
                }).toList();
        return new StartupSnapshot(recording.runId(), ProcessHandle.current().pid(),
                ManagementFactory.getRuntimeMXBean().getStartTime(), "JVM_UPTIME_MS", "PARTIAL",
                build, recording.milestones(), recording.tools(), STEP_CAPACITY, events.size(),
                events.size() >= STEP_CAPACITY, steps);
    }
}
