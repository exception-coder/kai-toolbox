package com.exceptioncoder.toolbox.performance.domain;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.LongSupplier;

/** 保存单次启动的首次观测；同步快照防止并发请求覆盖首个成功结果。 */
public final class StartupRecording {

    private static final int MAX_TOOLS = 64;
    private final String runId;
    private final LongSupplier uptime;
    private final Map<String, StartupObservation> milestones = new LinkedHashMap<>();
    private final Map<String, StartupObservation> tools = new LinkedHashMap<>();

    public StartupRecording(String runId, LongSupplier uptime) {
        this.runId = runId;
        this.uptime = uptime;
        for (String name : new String[]{"mainEntered", "springInvoked", "contextRefreshed", "applicationReady",
                "firstApiSuccess"}) {
            milestones.put(name, new StartupObservation("PENDING", null, null));
        }
    }

    /** 记录首次里程碑；重复事件不会覆盖已观测时间。 */
    public synchronized boolean complete(String name, String source) {
        StartupObservation previous = milestones.get(name);
        if (previous == null || !"PENDING".equals(previous.status())) {
            return false;
        }
        milestones.put(name, new StartupObservation("COMPLETED", uptime.getAsLong(), source));
        return true;
    }

    /** 启动失败时保留已完成阶段，将尚未完成的阶段标记为失败。 */
    public synchronized void fail() {
        milestones.replaceAll((name, value) -> "PENDING".equals(value.status())
                ? new StartupObservation("FAILED", null, "applicationFailed") : value);
    }

    /** 接受有限的显式工具状态，不推断未接入工具的就绪状态。 */
    public synchronized void observeTool(String name, String status) {
        if (!name.matches("[a-z0-9-]{1,64}")
                || !java.util.Set.of("COMPLETED", "FAILED", "SKIPPED", "NOT_OBSERVED").contains(status)) {
            throw new IllegalArgumentException("Invalid tool readiness observation");
        }
        if (tools.size() >= MAX_TOOLS && !tools.containsKey(name)) {
            throw new IllegalStateException("Tool observation capacity exceeded");
        }
        tools.putIfAbsent(name, new StartupObservation(status,
                "NOT_OBSERVED".equals(status) ? null : uptime.getAsLong(), "explicitAdapter"));
    }

    public synchronized boolean ready() {
        return "COMPLETED".equals(milestones.get("applicationReady").status());
    }

    public String runId() {
        return runId;
    }

    public synchronized Map<String, StartupObservation> milestones() {
        return new LinkedHashMap<>(milestones);
    }

    public synchronized Map<String, StartupObservation> tools() {
        return new LinkedHashMap<>(tools);
    }
}
