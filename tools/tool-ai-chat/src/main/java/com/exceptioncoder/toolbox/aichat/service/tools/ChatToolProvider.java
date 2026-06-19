package com.exceptioncoder.toolbox.aichat.service.tools;

/**
 * 标记接口:实现类是一组 {@link dev.langchain4j.agent.tool.Tool @Tool} 方法的提供者。
 *
 * <p>{@code ChatToolService} 注入所有 {@code ChatToolProvider} bean 并聚合其工具,
 * 故新增一类工具只需新建一个实现本接口的 {@code @Component};若该类工具有风险/可选,
 * 用 {@code @ConditionalOnProperty} 控制其是否被注册即可(未注册则其工具自然不出现)。</p>
 */
public interface ChatToolProvider {
}
