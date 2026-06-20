package com.exceptioncoder.toolbox.llm.routing;

import dev.langchain4j.model.chat.ChatModel;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.BiFunction;

/**
 * 共享 LLM 网关入口：按档位(tier)拿到一个池化路由 ChatModel。
 *
 * <p>消费方（如 ai-secretary）只需 {@code router.forTier("capture")} 拿到 ChatModel
 * 交给 AiServices，池化/限流/故障转移全在内部完成、对消费方透明。
 *
 * <p>可选的 {@code guard} 把每个 tier 的 {@link RoutingChatModel} 再包一层（如配额闸门 +
 * 计量边界）；不传则恒等透传，RoutingChatModel 保持纯路由零改动。
 */
public class ChatModelRouter {

    private final Map<String, ChatModel> tierModels = new ConcurrentHashMap<>();
    private final ChatModel all;

    public ChatModelRouter(Map<String, List<ModelEndpoint>> byTier, List<ModelEndpoint> allEndpoints) {
        this(byTier, allEndpoints, (scope, model) -> model);
    }

    public ChatModelRouter(Map<String, List<ModelEndpoint>> byTier, List<ModelEndpoint> allEndpoints,
                           BiFunction<String, ChatModel, ChatModel> guard) {
        byTier.forEach((tier, eps) ->
                tierModels.put(tier, guard.apply(tier, new RoutingChatModel(tier, eps))));
        this.all = guard.apply("*", new RoutingChatModel("*", allEndpoints));
    }

    /** 指定档位的路由模型；该档位无配置时回退到全体模型池。 */
    public ChatModel forTier(String tier) {
        ChatModel m = tierModels.get(tier);
        return m != null ? m : all;
    }

    /** 全体模型池（跨档位故障转移）。 */
    public ChatModel any() {
        return all;
    }
}
