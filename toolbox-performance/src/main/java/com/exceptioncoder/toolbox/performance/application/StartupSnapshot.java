package com.exceptioncoder.toolbox.performance.application;

import com.exceptioncoder.toolbox.performance.domain.StartupObservation;
import java.util.List;
import java.util.Map;

/** 当前启动的有界诊断快照；步骤耗时包含子步骤，不能相加。 */
public record StartupSnapshot(
        /** 每次 main 调用独立生成或由测量器注入的关联标识。 */
        String runId,
        /** JVM 进程标识。 */
        Long processId,
        /** JVM 启动的 UTC epoch 毫秒。 */
        Long jvmStartedAtEpochMs,
        /** 里程碑时钟定义。 */
        String clock,
        /** 尚未接入的工具不属于成功观测。 */
        String toolCoverage,
        /** 初始 JVM 启动前的监督构建观测，不是热编译耗时。 */
        StartupBuildObservation build,
        /** 里程碑。 */
        Map<String, StartupObservation> milestones,
        /** 显式工具观测。 */
        Map<String, StartupObservation> tools,
        /** 缓冲区最大步骤数。 */
        Integer stepCapacity,
        /** 已完成且保留的步骤数。 */
        Integer capturedStepCount,
        /** 缓冲区达到上限，可能缺失后续步骤。 */
        Boolean stepsPossiblyTruncated,
        /** 最慢的至多 100 个步骤。 */
        List<Step> slowestSteps) {

    /** Spring 启动步骤，parentId 保留嵌套关系。 */
    public record Step(
            /** Spring 步骤 ID。 */
            Long id,
            /** 父步骤 ID。 */
            Long parentId,
            /** 步骤名称。 */
            String name,
            /** 包含子步骤的耗时，单位毫秒。 */
            Double durationMs,
            /** 相对 Spring 采集起点的偏移毫秒。 */
            Long startOffsetMs,
            /** 仅保留 beanName 和 beanType。 */
            Map<String, String> tags) {
    }
}
