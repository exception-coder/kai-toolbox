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

import java.util.concurrent.TimeUnit;

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
        // 仅建客户端，不在启动主线程做任何网络调用：集合存在性检查/创建挪到下方异步 runner。
        // 原来在此同步 collectionExistsAsync().get()（无超时），Qdrant 不可达/慢失败时会阻塞 Spring
        // 上下文刷新，拖慢甚至卡住整个后端启动（前端表现为 /api 一直 ECONNREFUSED）。
        return new QdrantClient(grpc.build());
    }

    /**
     * 异步确保 Qdrant 集合存在，不阻塞启动。虚拟线程里跑；连不上只 warn（召回退化为不带历史上下文，
     * 与 rag 关闭时同口径），Qdrant 恢复后重启即补建。
     */
    @Bean
    @ConditionalOnProperty(prefix = "toolbox.visitor-analysis.rag", name = "enabled", havingValue = "true")
    public org.springframework.boot.ApplicationRunner visitorAnalysisQdrantInit(
            QdrantClient visitorAnalysisQdrantClient, VisitorAnalysisRagProperties props) {
        return args -> Thread.ofVirtual().name("visitor-analysis-qdrant-init")
                .start(() -> ensureCollection(visitorAnalysisQdrantClient, props));
    }

    /** 先查存在性、不存在才按向量维度 + 余弦距离创建（避免重复创建打 ALREADY_EXISTS 噪音）；带超时。 */
    private void ensureCollection(QdrantClient client, VisitorAnalysisRagProperties props) {
        try {
            if (Boolean.TRUE.equals(client.collectionExistsAsync(props.getCollection()).get(5, TimeUnit.SECONDS))) {
                log.info("[visitor-analysis] Qdrant 集合 {} 已存在，跳过创建", props.getCollection());
            } else {
                client.createCollectionAsync(
                        props.getCollection(),
                        Collections.VectorParams.newBuilder()
                                .setSize(props.getVectorSize())
                                .setDistance(Collections.Distance.Cosine)
                                .build())
                        .get(5, TimeUnit.SECONDS);
                log.info("[visitor-analysis] 创建 Qdrant 集合 {} (dim={})", props.getCollection(), props.getVectorSize());
            }
        } catch (Exception e) {
            log.warn("[visitor-analysis] Qdrant 集合初始化失败（Qdrant 恢复后重启即补建）：{}", e.getMessage());
        }
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
