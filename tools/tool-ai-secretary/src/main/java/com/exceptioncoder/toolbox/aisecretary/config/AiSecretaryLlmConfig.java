package com.exceptioncoder.toolbox.aisecretary.config;

import com.exceptioncoder.toolbox.aisecretary.ai.Capturer;
import com.exceptioncoder.toolbox.aisecretary.ai.ProfileExtractor;
import com.exceptioncoder.toolbox.aisecretary.ai.RecallAssistant;
import com.exceptioncoder.toolbox.llm.routing.ChatModelRouter;
import dev.langchain4j.service.AiServices;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 装配记录态的 Capturer 声明式 AiService。
 *
 * <p>模型不再由本模块直接构建，而是向共享网关 {@link ChatModelRouter} 要「capture」档位的
 * 路由 ChatModel——池化 / 限流 / 故障转移都在 toolbox-llm 内部完成，对本模块透明。
 * 未配置该档位时网关自动回退到默认（本地 Ollama）。
 */
@Configuration
public class AiSecretaryLlmConfig {

    /** 记录态用的档位：高频、可用便宜/本地模型。 */
    private static final String CAPTURE_TIER = "capture";
    /** 回忆态用的档位：仅做“据真实记录组织语言”，可接更强模型；未配置时网关回退到默认。 */
    private static final String RECALL_TIER = "recall";

    @Bean
    public Capturer capturer(ChatModelRouter router) {
        return AiServices.builder(Capturer.class)
                .chatModel(router.forTier(CAPTURE_TIER))
                .build();
    }

    /** 长期记忆「提议」角色：复用 capture 档位（高频、便宜/本地）。只产候选，落库与裁决在代码层。 */
    @Bean
    public ProfileExtractor profileExtractor(ChatModelRouter router) {
        return AiServices.builder(ProfileExtractor.class)
                .chatModel(router.forTier(CAPTURE_TIER))
                .build();
    }

    /**
     * 回忆态助手：<b>纯组织语言</b>，不挂工具、不做检索。
     *
     * <p>检索改由 {@code RecallRetriever} 在代码层确定性完成（向量 + 关键字 Hybrid），命中的真实记录
     * 由 {@code RecallService} 注入到 {@code @V("records")}，模型只负责措辞。如此从根上消除：
     * ① 小模型把 {@code <tool_call>} 当文本泄漏；② 上下文缺失时凭空编造召回结果。
     */
    @Bean
    public RecallAssistant recallAssistant(ChatModelRouter router) {
        return AiServices.builder(RecallAssistant.class)
                .chatModel(router.forTier(RECALL_TIER))
                .build();
    }
}
