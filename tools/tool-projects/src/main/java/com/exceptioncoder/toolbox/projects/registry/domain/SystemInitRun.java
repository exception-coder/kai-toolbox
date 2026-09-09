package com.exceptioncoder.toolbox.projects.registry.domain;

import java.util.List;

/** 一次初始化或手动同步的持久化进度。 */
public record SystemInitRun(
        /** 运行标识。 */ String id,
        /** 所属系统。 */ String projectId,
        /** FULL 或 SYNC。 */ String mode,
        /** RUNNING、COMPLETED 或 FAILED。 */ String state,
        /** 有序阶段结果。 */ List<Stage> stages,
        /** 可恢复失败原因。 */ String message,
        /** 开始时间。 */ Long startedAt,
        /** 最近更新时间。 */ Long updatedAt
) {
    /** 单个阶段的可观察状态。 */
    public record Stage(
            /** 阶段标识。 */ String id,
            /** 阶段名称。 */ String title,
            /** PENDING、RUNNING、COMPLETED、PARTIAL 或 FAILED。 */ String state,
            /** 结果说明。 */ String message
    ) { }
}
