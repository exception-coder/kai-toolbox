package com.exceptioncoder.toolbox.system.update;

import org.springframework.scheduling.support.CronExpression;

import java.time.Instant;
import java.time.ZoneId;

/** 每日触发开启有限重试窗口；不补跑停机时错过的触发，也不另建 Git 更新器。 */
final class AutoUpdateSchedule {

    private final AutoUpdateProperties properties;
    private final CronExpression cron;
    private final ZoneId zone;
    private volatile long retryUntil;

    AutoUpdateSchedule(AutoUpdateProperties properties) {
        this.properties = properties;
        this.cron = "-".equals(properties.getCron()) ? null : CronExpression.parse(properties.getCron());
        this.zone = ZoneId.of(properties.getZone());
    }

    void openWindow(long now) {
        retryUntil = now + properties.getRetryWindow().toMillis();
    }

    void closeWindow() {
        retryUntil = 0;
    }

    boolean isDue(long now) {
        return properties.getScheduleMode() == AutoUpdateProperties.ScheduleMode.INTERVAL || now < retryUntil;
    }

    Long nextCheck(long now, long delayMillis) {
        long retryAt = now + delayMillis;
        if (properties.getScheduleMode() == AutoUpdateProperties.ScheduleMode.INTERVAL
                || (isDue(now) && retryAt < retryUntil)) {
            return retryAt;
        }
        if (cron == null) {
            return null;
        }
        var next = cron.next(Instant.ofEpochMilli(now).atZone(zone));
        return next == null ? null : next.toInstant().toEpochMilli();
    }
}
