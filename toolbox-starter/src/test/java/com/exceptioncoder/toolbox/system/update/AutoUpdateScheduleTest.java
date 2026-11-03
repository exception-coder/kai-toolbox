package com.exceptioncoder.toolbox.system.update;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AutoUpdateScheduleTest {

    private final AutoUpdateProperties properties = new AutoUpdateProperties();
    private static final long MIDNIGHT = Instant.parse("2026-11-02T16:00:00Z").toEpochMilli();

    @org.junit.jupiter.api.BeforeEach
    void dailyFixture() { properties.setScheduleMode(AutoUpdateProperties.ScheduleMode.DAILY); }

    @Test
    void startupWaitsForNextShanghaiMidnightWithoutCatchingUpMissedRuns() {
        AutoUpdateSchedule schedule = new AutoUpdateSchedule(properties);
        long noon = Instant.parse("2026-11-02T04:00:00Z").toEpochMilli();
        assertThat(schedule.isDue(noon)).isFalse();
        assertThat(schedule.nextCheck(noon, 30_000)).isEqualTo(MIDNIGHT);
        assertThat(schedule.nextCheck(MIDNIGHT + 1, 30_000)).isEqualTo(MIDNIGHT + Duration.ofDays(1).toMillis());
    }

    @Test
    void dailyWindowAllowsStabilityAndFailureRetriesButStopsAtDeadline() {
        AutoUpdateSchedule schedule = new AutoUpdateSchedule(properties);
        schedule.openWindow(MIDNIGHT);
        long end = MIDNIGHT + Duration.ofHours(1).toMillis();
        assertThat(schedule.isDue(MIDNIGHT)).isTrue();
        assertThat(schedule.nextCheck(MIDNIGHT, 120_000)).isEqualTo(MIDNIGHT + 120_000);
        assertThat(schedule.isDue(end - 1)).isTrue();
        assertThat(schedule.isDue(end)).isFalse();
        assertThat(schedule.nextCheck(end - 1, 120_000)).isEqualTo(MIDNIGHT + Duration.ofDays(1).toMillis());
    }

    @Test
    void finishingWithoutUpdatesClosesWindowAndManualCheckCanReopenIt() {
        AutoUpdateSchedule schedule = new AutoUpdateSchedule(properties);
        schedule.openWindow(MIDNIGHT);
        schedule.closeWindow();
        assertThat(schedule.isDue(MIDNIGHT + 120_000)).isFalse();
        schedule.openWindow(MIDNIGHT + Duration.ofHours(8).toMillis());
        assertThat(schedule.isDue(MIDNIGHT + Duration.ofHours(8).toMillis())).isTrue();
    }

    @Test
    void defaultsPollEveryFiveMinutesWithFiveMinuteQuietWindow() {
        var defaults = new AutoUpdateProperties();
        assertThat(defaults.getScheduleMode()).isEqualTo(AutoUpdateProperties.ScheduleMode.INTERVAL);
        assertThat(defaults.getInterval()).isEqualTo(Duration.ofMinutes(5));
        assertThat(defaults.getIdleWindow()).isEqualTo(Duration.ofMinutes(5));
        assertThat(defaults.getRestartPolicy()).isEqualTo(AutoUpdateProperties.RestartPolicy.MANUAL);
    }

    @Test
    void intervalModeKeepsContinuousPolling() {
        properties.setScheduleMode(AutoUpdateProperties.ScheduleMode.INTERVAL);
        AutoUpdateSchedule schedule = new AutoUpdateSchedule(properties);
        assertThat(schedule.isDue(MIDNIGHT)).isTrue();
        assertThat(schedule.nextCheck(MIDNIGHT, 120_000)).isEqualTo(MIDNIGHT + 120_000);
    }

    @Test
    void explicitZoneChangesTriggerAndInvalidSettingsFailFast() {
        properties.setZone("UTC");
        assertThat(new AutoUpdateSchedule(properties).nextCheck(MIDNIGHT, 30_000))
                .isEqualTo(Instant.parse("2026-11-03T00:00:00Z").toEpochMilli());
        properties.setZone("invalid-zone");
        assertThatThrownBy(() -> new AutoUpdateSchedule(properties)).isInstanceOf(java.time.DateTimeException.class);
        properties.setZone("UTC");
        properties.setCron("invalid-cron");
        assertThatThrownBy(() -> new AutoUpdateSchedule(properties)).isInstanceOf(IllegalArgumentException.class);
    }
}
