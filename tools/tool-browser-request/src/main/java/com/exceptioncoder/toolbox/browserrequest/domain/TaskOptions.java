package com.exceptioncoder.toolbox.browserrequest.domain;

/**
 * Task 级配置。
 *
 * 两类延迟都支持「区间随机」min 必填 / max 可空，max>min 时区间内均匀抽取，否则退化为固定 min。
 *
 * - stepIntervalMs / stepIntervalMaxMs：不同 step 之间的延迟（ms）
 * - iterationIntervalMs / iterationIntervalMaxMs：同一 step fan-out 迭代之间的延迟（ms）。
 *   step 内迭代往往是「同一接口循环调用」，最容易触发风控，所以独立配置——通常配得比 step 间隔更大
 *
 * - continueOnError：缺省 false（遇错即停）
 */
public record TaskOptions(
        Integer stepIntervalMs,
        Integer stepIntervalMaxMs,
        Integer iterationIntervalMs,
        Integer iterationIntervalMaxMs,
        Boolean continueOnError
) {
}
