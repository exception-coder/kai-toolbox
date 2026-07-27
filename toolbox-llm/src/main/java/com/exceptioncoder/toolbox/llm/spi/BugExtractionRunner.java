package com.exceptioncoder.toolbox.llm.spi;

import java.util.List;

/**
 * 「咨询问答 → 结构化 BUG 记录」抽取能力的统一入口。
 *
 * <p>存在的理由是消灭「影子口径」：抽取判断原本只活在 fore-consult 前端会话里，
 * 评测侧另建了一份 headless 副本，两份 prompt 各改各的——评测通过不代表线上不退化。
 * 收敛后线上与评测走同一实现、同一份版本化提示词，评测才测的是真东西。
 *
 * <p>实现类在 tool-fore-consult（被测系统自己），调用方是 tool-eval（评测方）。
 * 依赖方向刻意是「评测 → 被测」：让被测系统反过来依赖评测工具会把评测变成生产链路的一环。
 *
 * <p>接口定义在 toolbox-llm 而非 toolbox-common，理由同 {@link AgentOneShotRunner}：
 * toolbox-common 约定不放工具专属代码，而 tool-eval 与 tool-fore-consult 本就都依赖
 * toolbox-llm，放这里不新增任何模块耦合。
 *
 * <p>调用会阻塞在 LLM 推理上，应在虚拟线程中进行，不要占用 Spring MVC 请求线程。
 */
public interface BugExtractionRunner {

    /**
     * 对一轮问答做缺陷判定与抽取。
     *
     * <p>实现方必须把 LLM 原始输出当作不可信入参：枚举值走白名单兜底，解析失败不要抛异常，
     * 而是返回 {@code extracted == null} 并保留 {@link Result#raw()}，交由调用方（断言层/登记层）判定。
     * 吞成异常会让「模型答错」和「链路挂了」混为一谈。
     *
     * @param question      用户提问原文
     * @param answer        AI 回答原文，须为剥离机器可读块后的正文
     * @param model         指定模型，{@code null} 表示用实现方默认模型
     * @param promptVersion 指定提示词版本用于重放，{@code null} 表示用当前生效版本
     * @return 抽取结果；解析失败时 {@code extracted} 为 {@code null}
     * @throws RuntimeException 引擎不可用、超时或提示词版本不存在时
     */
    Result extract(String question, String answer, String model, Integer promptVersion);

    /** 可用的提示词版本，供评测固定版本重放与「换 prompt 前后对比」。 */
    List<PromptVersion> listPromptVersions();

    /**
     * 归一化后的抽取结果。字段集与 consult_bug 的列对齐——少一个字段就等于线上登记的缺陷档案变薄。
     *
     * <p>{@code isBug} 为 false 时其余字段一律为 {@code null}——「不该抽的不抽」本身就是被考核项，
     * 判定非缺陷却仍吐出字段属于误报，调用方需要能看出这一点。
     *
     * <p>{@code type} / {@code severity} 由实现方按白名单归一，不会透传 LLM 的自由发挥。
     */
    record Extracted(boolean isBug, String type, String severity, String system, String module,
                     String title, String reproduce, String expected, String actual,
                     String suspectArea, Integer confidence) {
    }

    /**
     * @param extracted     归一化结果；{@code null} 表示 LLM 输出无法解析
     * @param raw           原始文本，排查解析失败用
     * @param promptVersion 本次实际使用的提示词版本，须落到评测记录里，否则回归对比无从归因
     * @param latencyMs     被测链路耗时
     */
    record Result(Extracted extracted, String raw, int promptVersion, long latencyMs) {
    }

    /** @param note 版本说明，便于人工识别「这版改了什么」 */
    record PromptVersion(int version, boolean active, String note) {
    }
}
