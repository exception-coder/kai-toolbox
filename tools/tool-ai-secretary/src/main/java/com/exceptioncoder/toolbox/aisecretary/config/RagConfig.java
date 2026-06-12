package com.exceptioncoder.toolbox.aisecretary.config;

import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.model.openai.OpenAiEmbeddingModel;
import dev.langchain4j.store.embedding.EmbeddingStore;
import dev.langchain4j.store.embedding.qdrant.QdrantEmbeddingStore;
import io.qdrant.client.QdrantClient;
import io.qdrant.client.QdrantGrpcClient;
import io.qdrant.client.grpc.Collections;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

import com.exceptioncoder.toolbox.aisecretary.repository.NoteRepository;
import com.exceptioncoder.toolbox.aisecretary.service.NoteIndexService;

/**
 * 向量 RAG 装配：仅当 toolbox.ai-secretary.rag.enabled=true 时生效。
 * 嵌入模型（本地 Ollama bge-m3）+ Qdrant 向量库 + 内容检索器（回忆态每次无条件检索注入）。
 */
@Configuration
@EnableConfigurationProperties(RagProperties.class)
@ConditionalOnProperty(prefix = "toolbox.ai-secretary.rag", name = "enabled", havingValue = "true")
public class RagConfig {

    private static final Logger log = LoggerFactory.getLogger(RagConfig.class);

    @Bean
    public EmbeddingModel aiSecretaryEmbeddingModel(RagProperties props) {
        return OpenAiEmbeddingModel.builder()
                .baseUrl(props.getEmbeddingBaseUrl())
                .apiKey(props.getEmbeddingApiKey())
                .modelName(props.getEmbeddingModel())
                .build();
    }

    @Bean
    public QdrantClient aiSecretaryQdrantClient(RagProperties props) {
        QdrantGrpcClient.Builder grpc = QdrantGrpcClient.newBuilder(
                props.getQdrantHost(), props.getQdrantPort(), props.isQdrantUseTls());
        if (StringUtils.hasText(props.getQdrantApiKey())) {
            grpc = grpc.withApiKey(props.getQdrantApiKey());
        }
        QdrantClient client = new QdrantClient(grpc.build());
        // 集合不存在则按向量维度 + 余弦距离创建；已存在会抛异常，吞掉即可
        try {
            client.createCollectionAsync(
                    props.getCollection(),
                    Collections.VectorParams.newBuilder()
                            .setSize(props.getVectorSize())
                            .setDistance(Collections.Distance.Cosine)
                            .build())
                    .get();
            log.info("[ai-secretary] 创建 Qdrant 集合 {} (dim={})", props.getCollection(), props.getVectorSize());
        } catch (Exception e) {
            log.info("[ai-secretary] Qdrant 集合 {} 已存在或创建跳过：{}", props.getCollection(), e.getMessage());
        }
        return client;
    }

    @Bean
    public EmbeddingStore<TextSegment> aiSecretaryEmbeddingStore(QdrantClient aiSecretaryQdrantClient,
                                                                 RagProperties props) {
        return QdrantEmbeddingStore.builder()
                .client(aiSecretaryQdrantClient)
                .collectionName(props.getCollection())
                .build();
    }

    // 注：检索（向量 + 关键字 Hybrid）已从 AiServices.retrievalAugmentor 内部移到代码层的
    // RecallRetriever，以便 RecallService 拿到“真实命中”并原样推前端（确定性优先 / 召回可见）。
    // 故此处不再装配 RetrievalAugmentor。

    /** 启动时把现有笔记回填进向量库（按 noteId upsert，幂等）。 */
    @Bean
    public ApplicationRunner aiSecretaryRagBackfill(NoteRepository repo, NoteIndexService index) {
        return args -> {
            var notes = repo.findRecent(10000);
            notes.forEach(n -> index.index(n.id(), n.rawText()));
            log.info("[ai-secretary] RAG 启动回填 {} 条笔记", notes.size());
        };
    }
}
