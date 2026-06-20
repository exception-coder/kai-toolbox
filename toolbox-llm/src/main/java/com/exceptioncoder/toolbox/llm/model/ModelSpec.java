package com.exceptioncoder.toolbox.llm.model;

import lombok.Data;

/**
 * 模型池中的一个成员配置。多个成员可同属一个 tier，形成「同档位池」——
 * 路由器在池内按权重分发、对失败成员熔断退避，实现限流分摊 + 故障转移。
 */
@Data
public class ModelSpec {

    /** 池内唯一标识，用于日志/熔断状态。 */
    private String id;

    /** 档位：如 capture（便宜/本地）、recall（强模型）。同 tier 的成员互为池/故障转移对象。 */
    private String tier = "default";

    /** OpenAI 兼容端点（含 /v1）。本地 Ollama 默认 http://localhost:11434/v1。 */
    private String baseUrl = "http://localhost:11434/v1";

    /** Ollama 不校验，占位即可；远端走环境变量。 */
    private String apiKey = "ollama";

    /** 模型名，如 qwen2.5:7b-instruct / deepseek-chat。 */
    private String model;

    private double temperature = 0.2;

    private int timeoutSeconds = 60;

    /** 池内分发权重（越大被选中概率越高）。 */
    private int weight = 1;

    /** 调用失败（含 429 限流）后该成员的熔断冷却时长，冷却期内路由跳过它。 */
    private long cooldownMs = 15000;

    /** 输入 token 单价（元 / 百万 token），用于成本计量。0 表示不计费（如本地模型）。 */
    private double inputPricePerMTok = 0.0;

    /** 输出 token 单价（元 / 百万 token），用于成本计量。0 表示不计费。 */
    private double outputPricePerMTok = 0.0;

    /** 缺省的本地 Ollama 成员——当未配置任何模型时兜底，保证开箱即用。 */
    public static ModelSpec localDefault() {
        ModelSpec s = new ModelSpec();
        s.setId("local-ollama");
        s.setTier("default");
        s.setModel("qwen2.5:7b-instruct");
        return s;
    }
}
