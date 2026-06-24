package com.exceptioncoder.toolbox.visitoranalysis.config;

import com.exceptioncoder.toolbox.llm.routing.ChatModelRouter;
import com.exceptioncoder.toolbox.visitoranalysis.ai.GreyZoneClassifier;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.model.openai.OpenAiEmbeddingModel;
import dev.langchain4j.service.AiServices;
import dev.langchain4j.store.embedding.EmbeddingStore;
import dev.langchain4j.store.embedding.qdrant.QdrantEmbeddingStore;
import io.qdrant.client.QdrantClient;
import io.qdrant.client.QdrantGrpcClient;
import io.qdrant.client.grpc.Collections;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

/**
 * 访客分析的 LLM / 向量装配。
 *
 * <p><b>灰区分类</b>：向共享网关 {@link ChatModelRouter} 要 {@code tier} 档位的路由 ChatModel
 * （池化 / 限流 / 故障转移在 toolbox-llm 内部完成，对本模块透明），交给 {@link AiServices} 生成
 * {@link GreyZoneClassifier} 实现。该档位未配置时网关回退默认（本地 Ollama）。
 *
 * <p><b>向量召回</b>：仅当 {@code toolbox.visitor-analysis.rag.enabled=true} 时装配嵌入模型 + Qdrant
 * 向量库（独立集合 {@code va_customers}），与 ai-secretary 同口径但物理隔离。关闭时整套 bean 不存在，
 * 灰区分类退化为「不带历史召回上下文」。
 */
@Configuration
public class VisitorAnalysisLlmConfig {

    private static final Logger log = LoggerFactory.getLogger(VisitorAnalysisLlmConfig.class);

    /** 灰区分类的声明式 AiService：模型经共享网关按档位取得。 */
    @Bean
    public GreyZoneClassifier greyZoneClassifier(ChatModelRouter router, VisitorAnalysisProperties props) {
        return AiServices.builder(GreyZoneClassifier.class)
                .chatModel(router.forTier(props.getTier()))
                .build();
    }

    // ── 向量召回（rag.enabled=true 才装配）───────────────────────────────────────

    @Bean
    @ConditionalOnProperty(prefix = "toolbox.visitor-analysis.rag", name = "enabled", havingValue = "true")
    public EmbeddingModel visitorAnalysisEmbeddingModel(VisitorAnalysisRagProperties props) {
        return OpenAiEmbeddingModel.builder()
                .baseUrl(props.getEmbeddingBaseUrl())
                .apiKey(props.getEmbeddingApiKey())
                .modelName(props.getEmbeddingModel())
                .build();
    }

    @Bean
    @ConditionalOnProperty(prefix = "toolbox.visitor-analysis.rag", name = "enabled", havingValue = "true")
    public QdrantClient visitorAnalysisQdrantClient(VisitorAnalysisRagProperties props) {
        QdrantGrpcClient.Builder grpc = QdrantGrpcClient.newBuilder(
                props.getQdrantHost(), props.getQdrantPort(), props.isQdrantUseTls());
        if (StringUtils.hasText(props.getQdrantApiKey())) {
            grpc = grpc.withApiKey(props.getQdrantApiKey());
        }
        QdrantClient client = new QdrantClient(grpc.build());
        // 先查存在性，不存在才按向量维度 + 余弦距离创建：避免重复创建时 Qdrant 客户端打 ALREADY_EXISTS 噪音。
        try {
            if (Boolean.TRUE.equals(client.collectionExistsAsync(props.getCollection()).get())) {
                log.info("[visitor-analysis] Qdrant 集合 {} 已存在，跳过创建", props.getCollection());
            } else {
                client.createCollectionAsync(
                        props.getCollection(),
                        Collections.VectorParams.newBuilder()
                                .setSize(props.getVectorSize())
                                .setDistance(Collections.Distance.Cosine)
                                .build())
                        .get();
                log.info("[visitor-analysis] 创建 Qdrant 集合 {} (dim={})", props.getCollection(), props.getVectorSize());
            }
        } catch (Exception e) {
            log.warn("[visitor-analysis] Qdrant 集合初始化失败：{}", e.getMessage());
        }
        return client;
    }

    @Bean
    @ConditionalOnProperty(prefix = "toolbox.visitor-analysis.rag", name = "enabled", havingValue = "true")
    public EmbeddingStore<TextSegment> visitorAnalysisEmbeddingStore(
            QdrantClient visitorAnalysisQdrantClient, VisitorAnalysisRagProperties props) {
        return QdrantEmbeddingStore.builder()
                .client(visitorAnalysisQdrantClient)
                .collectionName(props.getCollection())
                .build();
    }
}
