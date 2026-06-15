package com.exceptioncoder.toolbox.java8gu.config;

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
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

/**
 * Java 八股 RAG 装配：仅当 toolbox.java8gu.rag.enabled=true 时生效。
 * 本地 Ollama bge-m3 嵌入 + Qdrant（独立集合 java8gu_cards）。入库为按需批量（见 Java8guRagService），
 * 不像个人秘书那样在 capture 时增量写。
 */
@Configuration
@EnableConfigurationProperties(Java8guRagProperties.class)
@ConditionalOnProperty(prefix = "toolbox.java8gu.rag", name = "enabled", havingValue = "true")
public class Java8guRagConfig {

    private static final Logger log = LoggerFactory.getLogger(Java8guRagConfig.class);

    @Bean
    public EmbeddingModel java8guEmbeddingModel(Java8guRagProperties props) {
        return OpenAiEmbeddingModel.builder()
                .baseUrl(props.getEmbeddingBaseUrl())
                .apiKey(props.getEmbeddingApiKey())
                .modelName(props.getEmbeddingModel())
                .build();
    }

    @Bean
    public QdrantClient java8guQdrantClient(Java8guRagProperties props) {
        QdrantGrpcClient.Builder grpc = QdrantGrpcClient.newBuilder(
                props.getQdrantHost(), props.getQdrantPort(), props.isQdrantUseTls());
        if (StringUtils.hasText(props.getQdrantApiKey())) {
            grpc = grpc.withApiKey(props.getQdrantApiKey());
        }
        QdrantClient client = new QdrantClient(grpc.build());
        try {
            client.createCollectionAsync(
                    props.getCollection(),
                    Collections.VectorParams.newBuilder()
                            .setSize(props.getVectorSize())
                            .setDistance(Collections.Distance.Cosine)
                            .build())
                    .get();
            log.info("[java8gu] 创建 Qdrant 集合 {} (dim={})", props.getCollection(), props.getVectorSize());
        } catch (Exception e) {
            log.info("[java8gu] Qdrant 集合 {} 已存在或创建跳过：{}", props.getCollection(), e.getMessage());
        }
        return client;
    }

    @Bean
    public EmbeddingStore<TextSegment> java8guEmbeddingStore(QdrantClient java8guQdrantClient,
                                                             Java8guRagProperties props) {
        return QdrantEmbeddingStore.builder()
                .client(java8guQdrantClient)
                .collectionName(props.getCollection())
                .build();
    }
}
