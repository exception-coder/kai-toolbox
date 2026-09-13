package com.exceptioncoder.toolbox.llm.spi;

/** 构建禁用工具的一次性文本请求；每次任务独立创建，不在多个线程间共享。 */
public final class AgentTextRequestBuilder {
    private String systemPrompt;
    private String userPrompt;
    private String model;
    private String engine;

    /** 设置可选的系统提示。 */
    public AgentTextRequestBuilder systemPrompt(String value) {
        systemPrompt = value;
        return this;
    }

    /** 设置本次任务内容，执行时要求非空白。 */
    public AgentTextRequestBuilder userPrompt(String value) {
        userPrompt = value;
        return this;
    }

    /** 设置模型；空值沿用引擎默认。 */
    public AgentTextRequestBuilder model(String value) {
        model = value;
        return this;
    }

    /** 设置引擎；空值使用默认引擎，支持范围由运行实现声明。 */
    public AgentTextRequestBuilder engine(String value) {
        engine = value;
        return this;
    }

    /** 返回不可变请求，不启动引擎或检查账号状态。 */
    public AgentOneShotRunner.ExecutionRequest build() {
        return AgentOneShotRunner.ExecutionRequest.text(systemPrompt, userPrompt, model, engine);
    }
}
