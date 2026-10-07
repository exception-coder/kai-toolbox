package com.exceptioncoder.toolbox.claudechat.service.autopilot;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/** 仅对持续不可确认的运行链路计数；正常忙碌不能触发故障暂停。 */
public final class RuntimeProbeFailureGuard {
    private final Map<String, Failure> failures = new LinkedHashMap<>();

    public synchronized boolean observe(String scope, String code, Instant now) {
        if (!"SIDECAR_UNREACHABLE".equals(code) && !"STALE".equals(code)) {
            failures.remove(scope);
            return false;
        }
        Failure previous = failures.get(scope);
        Failure next = previous == null ? new Failure(now, 1)
                : new Failure(previous.since(), previous.count() + 1);
        failures.put(scope, next);
        while (failures.size() > 256) failures.remove(failures.keySet().iterator().next());
        return next.count() >= 3 && !now.isBefore(next.since().plus(Duration.ofMinutes(1)));
    }

    private record Failure(Instant since, int count) { }
}
