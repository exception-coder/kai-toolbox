package com.exceptioncoder.toolbox.llm.routing;

import dev.langchain4j.model.ModelProvider;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.Capability;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.request.ChatRequestParameters;
import dev.langchain4j.model.chat.response.ChatResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 一个档位的「池化 + 路由」ChatModel 装饰器：对上层 AiServices 透明（它只认一个 ChatModel）。
 *
 * <p>每次 {@link #chat(ChatRequest)}：
 * <ol>
 *   <li>按权重随机选一个起点成员，其余成员排在其后作为故障转移链；</li>
 *   <li>跳过处于熔断冷却中的成员；</li>
 *   <li>调用失败（含 429 限流）→ 熔断该成员并转移到下一个；</li>
 *   <li>全部冷却中时，仍兜底尝试第一个，避免「都在冷却」直接拒绝。</li>
 * </ol>
 * 能力/参数/provider 等元信息委托给主成员，保证结构化输出探测正常。
 */
public class RoutingChatModel implements ChatModel {

    private static final Logger log = LoggerFactory.getLogger(RoutingChatModel.class);

    private final String tier;
    private final List<ModelEndpoint> endpoints;

    public RoutingChatModel(String tier, List<ModelEndpoint> endpoints) {
        if (endpoints == null || endpoints.isEmpty()) {
            throw new IllegalArgumentException("RoutingChatModel[" + tier + "] 至少需要一个模型成员");
        }
        this.tier = tier;
        this.endpoints = List.copyOf(endpoints);
    }

    @Override
    public ChatResponse chat(ChatRequest chatRequest) {
        List<ModelEndpoint> order = orderedCandidates();
        RuntimeException last = null;
        boolean anyTried = false;
        for (ModelEndpoint ep : order) {
            if (!ep.available()) {
                continue;
            }
            anyTried = true;
            try {
                return ep.delegate().chat(chatRequest);
            } catch (RuntimeException e) {
                last = e;
                ep.trip();
                log.warn("[toolbox-llm] tier={} 成员 {} 调用失败，已熔断并故障转移: {}",
                        tier, ep.spec().getId(), e.toString());
            }
        }
        // 全部在冷却：兜底硬试主成员，别直接拒绝
        if (!anyTried) {
            ModelEndpoint primary = endpoints.get(0);
            log.warn("[toolbox-llm] tier={} 全部成员冷却中，兜底尝试 {}", tier, primary.spec().getId());
            try {
                return primary.delegate().chat(chatRequest);
            } catch (RuntimeException e) {
                last = e;
            }
        }
        throw last != null ? last
                : new IllegalStateException("[toolbox-llm] tier=" + tier + " 无可用模型");
    }

    /** 按权重随机选起点，其余依次排在后面作为故障转移链。 */
    private List<ModelEndpoint> orderedCandidates() {
        int n = endpoints.size();
        if (n == 1) {
            return endpoints;
        }
        int total = 0;
        for (ModelEndpoint ep : endpoints) {
            total += Math.max(1, ep.spec().getWeight());
        }
        int r = ThreadLocalRandom.current().nextInt(total);
        int start = 0;
        int acc = 0;
        for (int i = 0; i < n; i++) {
            acc += Math.max(1, endpoints.get(i).spec().getWeight());
            if (r < acc) {
                start = i;
                break;
            }
        }
        List<ModelEndpoint> order = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            order.add(endpoints.get((start + i) % n));
        }
        return order;
    }

    private ChatModel primary() {
        return endpoints.get(0).delegate();
    }

    @Override
    public Set<Capability> supportedCapabilities() {
        return primary().supportedCapabilities();
    }

    @Override
    public ChatRequestParameters defaultRequestParameters() {
        return primary().defaultRequestParameters();
    }

    @Override
    public ModelProvider provider() {
        return primary().provider();
    }
}
