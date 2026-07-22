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

import java.util.concurrent.TimeUnit;

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
        // checkCompatibility=false：跳过建 client 时的同步版本探测。该探测在 build() 里同步请求
        // 服务端版本号，Qdrant 不可达时会卡到超时（实测 ~80s）阻塞启动主线程——这是启动慢的主因。
        QdrantGrpcClient.Builder grpc = QdrantGrpcClient.newBuilder(
                props.getQdrantHost(), props.getQdrantPort(), props.isQdrantUseTls(), false);
        if (StringUtils.hasText(props.getQdrantApiKey())) {
            grpc = grpc.withApiKey(props.getQdrantApiKey());
        }
        // 仅建客户端，不在启动主线程做任何网络调用：集合存在性检查/创建挪到下方异步 runner。
        // 原来在此同步 collectionExistsAsync().get()（无超时），Qdrant 不可达/慢失败时会阻塞 Spring
        // 上下文刷新，拖慢甚至卡住整个后端启动（前端表现为 /api 一直 ECONNREFUSED）。
        return new QdrantClient(grpc.build());
    }

    /**
     * 确保 Qdrant 集合存在（异步调用，带超时；失败返回 false，调用方据此跳过回填）。
     * 先查存在性、不存在才按向量维度 + 余弦距离创建——避免重复创建时打 ALREADY_EXISTS 噪音。
     */
    private boolean ensureCollection(QdrantClient client, RagProperties props) {
        try {
            if (Boolean.TRUE.equals(client.collectionExistsAsync(props.getCollection()).get(5, TimeUnit.SECONDS))) {
                log.info("[ai-secretary] Qdrant 集合 {} 已存在，跳过创建", props.getCollection());
            } else {
                client.createCollectionAsync(
                        props.getCollection(),
                        Collections.VectorParams.newBuilder()
                                .setSize(props.getVectorSize())
                                .setDistance(Collections.Distance.Cosine)
                                .build())
                        .get(5, TimeUnit.SECONDS);
                log.info("[ai-secretary] 创建 Qdrant 集合 {} (dim={})", props.getCollection(), props.getVectorSize());
            }
            return true;
        } catch (Exception e) {
            log.warn("[ai-secretary] Qdrant 集合初始化失败（跳过 RAG 回填；Qdrant 恢复后重启即补全）：{}", e.getMessage());
            return false;
        }
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

    /**
     * 启动时把现有笔记回填进向量库（按 noteId upsert，幂等）。
     *
     * <p>放虚拟线程异步跑，不阻塞启动；且「一条失败即中止」——嵌入端点（本地 Ollama）没起时，
     * 逐条重试会刷满启动日志（每条 2 次重试 + 完整栈）。改为探测式：首条失败即判定端点不可达，
     * 打一行可操作的提示后停手，等 Ollama 起来重启即可补全；期间 capture 的新笔记写入时也会自动补索引。
     */
    @Bean
    public ApplicationRunner aiSecretaryRagBackfill(QdrantClient aiSecretaryQdrantClient,
                                                    NoteRepository repo, NoteIndexService index, RagProperties props) {
        return args -> Thread.ofVirtual().name("ai-secretary-rag-init").start(() -> {
            // 先异步确保集合存在（原来在 QdrantClient bean 里同步做，会阻塞启动）。不可达即跳过回填。
            if (!ensureCollection(aiSecretaryQdrantClient, props)) return;
            try {
                var notes = repo.findRecent(10000);
                if (notes.isEmpty()) return;
                int ok = 0;
                for (var n : notes) {
                    if (!index.index(n.id(), n.rawText())) {
                        log.warn("[ai-secretary] 嵌入服务不可达，已中止 RAG 启动回填（{}/{} 完成）。"
                                + "确认本地 Ollama 已启动并 `ollama pull {}`（端点 {}）后重启即补全；"
                                + "新 capture 的笔记写入时也会自动补索引。",
                                ok, notes.size(), props.getEmbeddingModel(), props.getEmbeddingBaseUrl());
                        return;
                    }
                    ok++;
                }
                log.info("[ai-secretary] RAG 启动回填 {} 条笔记", ok);
            } catch (Exception e) {
                log.warn("[ai-secretary] RAG 启动回填异常，跳过：{}", e.toString());
            }
        });
    }
}
