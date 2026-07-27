package com.exceptioncoder.toolbox.eval.spi;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * L1 适配层：被测能力接入评测底座的唯一契约。
 * <p>
 * 实现类注册为 Spring Bean 即被 {@code EvalRunService} 收集。L0 不关心被测的是本地服务、
 * LLM 链路还是远程 HTTP 接口，只要求「同样的入参 + 同样的口径 → 可重放」。
 * <p>
 * 实现约定：
 * <ul>
 *   <li>阻塞调用（尤其 LLM）必须由调用方放在虚拟线程上，实现内不再自行开线程。</li>
 *   <li>解析失败不要抛异常淹没信息，把原始文本放进 {@link Output#raw()} 交由断言层判负。</li>
 *   <li>输出必须归一化成结构化 {@link JsonNode}，禁止把自由文本直接丢给断言层。</li>
 * </ul>
 */
public interface EvalAdapter {

    /** 全局唯一标识，写入 eval_run.adapter。 */
    String id();

    /** 支持的任务形态，与 eval_case.scenario 对齐。 */
    String scenario();

    /** 该 adapter 使用的提示词 key；返回 null 表示不依赖提示词。 */
    default String promptKey() {
        return null;
    }

    /**
     * 提示词由被测系统自己托管时（收敛后的正确形态），返回本轮要固定的版本号；
     * 返回 {@code null} 表示提示词存在评测侧的 eval_prompt 里，由 L0 负责解析。
     *
     * <p>为什么要「固定」而不是每条用例现取 active：跑批过程中有人激活了新版本的话，
     * 同一轮 run 会前半段用旧版、后半段用新版，报告就再也解释不清了。
     *
     * @param requested 用户指定的版本，null 表示取当前生效版本
     */
    default Integer pinExternalPromptVersion(Integer requested) {
        return null;
    }

    Output run(Input input) throws Exception;

    /**
     * @param caseId        用例 id，仅用于日志溯源
     * @param payload       eval_case.input_json 解析后的对象
     * @param model         指定模型，null 表示引擎默认
     * @param prompt        已解析出的提示词内容，null 表示该 adapter 不从评测侧取提示词
     * @param promptVersion 本轮固定的提示词版本，供托管在被测系统侧的 adapter 透传下去
     */
    record Input(String caseId, JsonNode payload, String model, String prompt, Integer promptVersion) {
    }

    /**
     * @param result    归一化后的结构化输出，交给断言层
     * @param raw       原始文本，排查解析失败用
     * @param latencyMs 被测链路耗时
     */
    record Output(JsonNode result, String raw, long latencyMs) {
    }
}
