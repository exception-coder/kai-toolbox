package com.exceptioncoder.toolbox.aisecretary.config;

import com.exceptioncoder.toolbox.aisecretary.ai.Capturer;
import com.exceptioncoder.toolbox.aisecretary.ai.RecallAssistant;
import com.exceptioncoder.toolbox.aisecretary.service.NoteTools;
import com.exceptioncoder.toolbox.llm.routing.ChatModelRouter;
import dev.langchain4j.rag.content.retriever.ContentRetriever;
import dev.langchain4j.service.AiServices;
import org.springframework.beans.factory.ObjectProvider;
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
    /** 回忆态用的档位：多步工具编排，可接更强模型；未配置时网关回退到默认。 */
    private static final String RECALL_TIER = "recall";

    @Bean
    public Capturer capturer(ChatModelRouter router) {
        return AiServices.builder(Capturer.class)
                .chatModel(router.forTier(CAPTURE_TIER))
                .build();
    }

    @Bean
    public RecallAssistant recallAssistant(ChatModelRouter router, NoteTools noteTools,
                                           ObjectProvider<ContentRetriever> contentRetrievers) {
        AiServices<RecallAssistant> builder = AiServices.builder(RecallAssistant.class)
                .chatModel(router.forTier(RECALL_TIER))
                .tools(noteTools)
                // 抗造⑤：限制工具循环轮数，防模型抽风死循环
                .maxToolCallingRoundTrips(6);
        // RAG 开启时挂上内容检索器：每次提问先无条件语义检索并注入上下文，
        // 不再依赖模型“主动决定”调 searchNotes（根治“没查就说没有”）。
        ContentRetriever retriever = contentRetrievers.getIfAvailable();
        if (retriever != null) {
            builder = builder.contentRetriever(retriever);
        }
        return builder.build();
    }
}
