package com.exceptioncoder.toolbox.llm.routing;

import com.exceptioncoder.toolbox.llm.model.ModelSpec;
import dev.langchain4j.model.chat.ChatModel;

/**
 * 池内一个可调用成员：LangChain4j 委托模型 + 其配置 + 熔断状态。
 */
public class ModelEndpoint {

    private final ModelSpec spec;
    private final ChatModel delegate;
    /** 熔断到期的 System.nanoTime() 时间点；之前不可用。 */
    private volatile long cooldownUntilNanos = 0L;

    public ModelEndpoint(ModelSpec spec, ChatModel delegate) {
        this.spec = spec;
        this.delegate = delegate;
    }

    public ModelSpec spec() {
        return spec;
    }

    public ChatModel delegate() {
        return delegate;
    }

    public boolean available() {
        return System.nanoTime() >= cooldownUntilNanos;
    }

    /** 调用失败后熔断该成员一段时间，路由暂时绕开。 */
    public void trip() {
        cooldownUntilNanos = System.nanoTime() + spec.getCooldownMs() * 1_000_000L;
    }
}
