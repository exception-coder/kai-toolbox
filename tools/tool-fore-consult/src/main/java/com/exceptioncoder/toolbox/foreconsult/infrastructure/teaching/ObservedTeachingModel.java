package com.exceptioncoder.toolbox.foreconsult.infrastructure.teaching;

import io.agentscope.core.message.Msg;
import io.agentscope.core.message.ToolResultBlock;
import io.agentscope.core.model.ChatModelBase;
import io.agentscope.core.model.ChatResponse;
import io.agentscope.core.model.GenerateOptions;
import io.agentscope.core.model.Model;
import io.agentscope.core.model.ToolSchema;
import java.util.List;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import reactor.core.publisher.Flux;

/** 记录真实模型调用边界及供应商报告用量，不记录提示词或请求凭据。 */
final class ObservedTeachingModel extends ChatModelBase {
    private final Model delegate;
    private final TeachingTrace trace;
    private final Set<String> observedResults = new HashSet<>();

    ObservedTeachingModel(Model delegate, TeachingTrace trace) {
        this.delegate = delegate;
        this.trace = trace;
    }

    @Override
    public String getModelName() {
        return delegate.getModelName();
    }

    @Override
    protected Flux<ChatResponse> doStream(List<Msg> messages, List<ToolSchema> tools, GenerateOptions options) {
        return Flux.defer(() -> {
            recordToolResults(messages);
            trace.add("MODEL", "调用 " + getModelName() + " · 可用工具 " + tools.size());
            AtomicReference<Integer> usage = new AtomicReference<>();
            return delegate.stream(messages, tools, options)
                    .doOnNext(response -> {
                        if (response.getUsage() != null) {
                            usage.set(response.getUsage().getTotalTokens());
                        }
                    })
                    .doOnComplete(() -> {
                        if (usage.get() != null) {
                            trace.usage(usage.get());
                        }
                        trace.add("MODEL_END", "模型调用结束");
                    })
                    .doOnError(failure -> trace.add("MODEL_END", "模型调用失败 · " + failure.getClass().getSimpleName()));
        });
    }

    private void recordToolResults(List<Msg> messages) {
        for (Msg message : messages) {
            for (ToolResultBlock result : message.getContentBlocks(ToolResultBlock.class)) {
                if (observedResults.add(result.getId())) {
                    trace.add("TOOL_RESULT", result.getName() + " · " + result.getState());
                }
            }
        }
    }
}
