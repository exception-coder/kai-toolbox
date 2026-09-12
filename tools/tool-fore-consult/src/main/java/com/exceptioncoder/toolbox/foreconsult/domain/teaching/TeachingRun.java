package com.exceptioncoder.toolbox.foreconsult.domain.teaching;

import java.util.List;

/** 一次运行的不可变证据；Token 不可得时为 null。 */
public record TeachingRun(
        /** 运行关联 ID。 */ String id,
        /** 配置版本。 */ Long version,
        /** DEMO 或 LIVE。 */ String mode,
        /** 输入快照。 */ String input,
        /** 运行状态。 */ String status,
        /** 展示回答。 */ String answer,
        /** 经过 Java 校验的草稿。 */ OrderDraft draft,
        /** 已观察事件。 */ List<Step> steps,
        /** 总耗时毫秒。 */ Long elapsedMs,
        /** 模型报告 Token。 */ Integer tokens,
        /** 创建时间毫秒。 */ Long createdAt) {
    /** 可回放的执行步骤。 */
    public record Step(
            /** 发生时间相对毫秒。 */ Long elapsedMs,
            /** 事件类型。 */ String type,
            /** 可读详情。 */ String detail) {
    }
}
