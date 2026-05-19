package com.exceptioncoder.toolbox.browserrequest.api.dto;

import java.util.List;

/**
 * Pipeline 相关 DTO 集中处。Step 用单个 record + type 字段（"single" / "foreach"）
 * 而非多态层次结构 —— Jackson 多态序列化对 sealed interface 配合 Spring 校验偶尔有坑，
 * 用简单 record + 运行时 type 字段判断的写法在这里更稳。
 */
public final class PipelineDtos {

    private PipelineDtos() {}

    public record OutputSpec(
            String name,
            String jsonPath,
            /** true 时 step 输出除了写 chain vars，还会落到 session vars（持久化到 DB）。 */
            boolean persist
    ) {}

    /** foreach step 的循环源：从某个变量（chain 或 session）取，再可选用 JSONPath 提取/扁平。 */
    public record ForeachSource(String varName, String jsonPath) {}

    public record StepDto(
            String id,
            String name,
            /** "single" 或 "foreach"。 */
            String type,
            /** 请求模板，所有 step 都有。 */
            ExecuteRequestBody request,
            /** 仅 foreach step 用，single step 应为 null。 */
            ForeachSource source,
            List<OutputSpec> outputs,
            boolean continueOnError,
            /**
             * 每次请求后等待的毫秒数（节流 / 限流）。
             *   - single: 本 step 完成后等 N ms 再进入下一个 step（向后兼容；新 pipeline 推荐用 afterStepMs）
             *   - foreach: 每次 item 完成后等 N ms 再下一条
             * null 或 ≤0 表示不等待。
             */
            Integer requestIntervalMs,
            /**
             * 本 step 完成后、进入下一 step 之前的等待毫秒数。所有 step 类型都生效。
             *   - 对 single：等价于 requestIntervalMs（旧字段），优先用本字段；本字段为 null 时回落 requestIntervalMs
             *   - 对 foreach：requestIntervalMs 控制 item 之间，本字段控制 step 之间（首次引入）
             * null 或 ≤0 表示不等待。
             */
            Integer afterStepMs
    ) {}

    public record CreatePipelineRequest(String name, List<StepDto> steps) {}

    public record UpdatePipelineRequest(String name, List<StepDto> steps) {}
}
