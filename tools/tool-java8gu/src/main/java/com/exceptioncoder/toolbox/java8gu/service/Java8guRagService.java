package com.exceptioncoder.toolbox.java8gu.service;

import com.exceptioncoder.toolbox.java8gu.config.Java8guRagProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.langchain4j.data.document.Metadata;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.store.embedding.EmbeddingSearchRequest;
import dev.langchain4j.store.embedding.EmbeddingStore;
import dev.langchain4j.store.embedding.filter.MetadataFilterBuilder;
import io.qdrant.client.QdrantClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Java 八股 RAG 核心：批量入库（确定性 ETL，无 LLM）+ 向量检索 + 自检。
 *
 * <p><b>入库</b>：读 {@code contentDir/index.json}（分类+题目元数据）与 {@code q/{id}.md}（正文），
 * 每题嵌入后 upsert；点 id 用题号派生确定性 UUID（Qdrant 点 id 只接受 uint64/UUID，题号"0004"两者都不是），
 * 题号/分类/标题写入 payload metadata。幂等：重跑覆盖。
 *
 * <p><b>检索</b>：向量 top-k，命中后<b>从 metadata 直接还原</b>卡片字段（无需 SQLite），代码原样回传。
 */
@Service
public class Java8guRagService {

    private static final Logger log = LoggerFactory.getLogger(Java8guRagService.class);

    private final Optional<EmbeddingModel> embeddingModel;
    private final Optional<EmbeddingStore<TextSegment>> embeddingStore;
    private final Optional<QdrantClient> qdrantClient;
    private final Optional<Java8guRagProperties> props;
    private final ObjectMapper objectMapper;

    public Java8guRagService(@Qualifier("java8guEmbeddingModel") Optional<EmbeddingModel> embeddingModel,
                             @Qualifier("java8guEmbeddingStore") Optional<EmbeddingStore<TextSegment>> embeddingStore,
                             @Qualifier("java8guQdrantClient") Optional<QdrantClient> qdrantClient,
                             Optional<Java8guRagProperties> props,
                             ObjectMapper objectMapper) {
        this.embeddingModel = embeddingModel;
        this.embeddingStore = embeddingStore;
        this.qdrantClient = qdrantClient;
        this.props = props;
        this.objectMapper = objectMapper;
    }

    public boolean isEnabled() {
        return embeddingModel.isPresent() && embeddingStore.isPresent() && props.isPresent();
    }

    // ---------------- 入库 ----------------

    /** 全量重建索引：读内容目录所有卡片 → 嵌入 → upsert。返回入库条数与重建后状态。 */
    public Map<String, Object> reindex() {
        Map<String, Object> m = new LinkedHashMap<>();
        if (!isEnabled()) {
            m.put("enabled", false);
            m.put("hint", "RAG 未启用：启动需带 -Dtoolbox.java8gu.rag.enabled=true 且 Qdrant 可达");
            return m;
        }
        m.put("enabled", true);
        try {
            Path dir = resolveContentDir();
            JsonNode index = objectMapper.readTree(dir.resolve("index.json").toFile());
            Map<String, String> catLabel = new HashMap<>();
            for (JsonNode c : index.path("categories")) {
                catLabel.put(c.path("id").asText(), c.path("label").asText());
            }
            int ok = 0, skipped = 0;
            for (JsonNode q : index.path("questions")) {
                String id = q.path("id").asText();
                String categoryId = q.path("categoryId").asText();
                String title = q.path("title").asText();
                Path md = dir.resolve("q").resolve(id + ".md");
                if (!Files.isRegularFile(md)) {
                    skipped++;
                    continue;
                }
                String body = Files.readString(md, StandardCharsets.UTF_8);
                indexCard(id, categoryId, catLabel.getOrDefault(categoryId, categoryId), title, body);
                if (++ok % 200 == 0) {
                    log.info("[java8gu] 入库进度 {}/{}", ok, index.path("questions").size());
                }
            }
            log.info("[java8gu] 入库完成：{} 条（跳过 {}）", ok, skipped);
            m.put("indexed", ok);
            m.put("skipped", skipped);
            m.put("contentDir", dir.toString());
        } catch (Exception e) {
            log.warn("[java8gu] 入库失败", e);
            m.put("error", e.toString());
        }
        m.putAll(status());
        return m;
    }

    private void indexCard(String id, String categoryId, String categoryLabel, String title, String body) {
        String text = title + "\n" + body;
        Embedding emb = embeddingModel.get().embed(text).content();
        Map<String, String> meta = new HashMap<>();
        meta.put("id", id);
        meta.put("categoryId", categoryId);
        meta.put("categoryLabel", categoryLabel);
        meta.put("title", title);
        String pointId = UUID.nameUUIDFromBytes(("java8gu:" + id).getBytes(StandardCharsets.UTF_8)).toString();
        embeddingStore.get().addAll(
                List.of(pointId),
                List.of(emb),
                List.of(TextSegment.from(body, Metadata.from(meta))));
    }

    // ---------------- 检索 ----------------

    /**
     * 向量检索；命中从 payload metadata 还原为 CardHit。RAG 关或出错返回空。
     *
     * @param categoryId 非空则用 Qdrant metadata 过滤，把检索限定在该分类内（"只考并发类"等）
     */
    public List<CardHit> retrieve(String question, String categoryId) {
        if (!isEnabled() || !StringUtils.hasText(question)) {
            return List.of();
        }
        try {
            Embedding q = embeddingModel.get().embed(question).content();
            EmbeddingSearchRequest.EmbeddingSearchRequestBuilder builder = EmbeddingSearchRequest.builder()
                    .queryEmbedding(q)
                    .maxResults(props.get().getMaxResults())
                    .minScore(props.get().getMinScore());
            if (StringUtils.hasText(categoryId)) {
                // payload metadata 精确过滤：仅检索 categoryId 命中的卡片（向量召回在分类内做）
                builder = builder.filter(MetadataFilterBuilder.metadataKey("categoryId").isEqualTo(categoryId));
            }
            EmbeddingSearchRequest req = builder.build();
            List<CardHit> hits = new ArrayList<>();
            embeddingStore.get().search(req).matches().forEach(match -> {
                TextSegment seg = match.embedded();
                Metadata md = seg.metadata();
                hits.add(new CardHit(
                        md.getString("id"),
                        md.getString("categoryId"),
                        md.getString("categoryLabel"),
                        md.getString("title"),
                        seg.text(),
                        match.score()));
            });
            log.info("[java8gu] 检索命中 {} 条：q={}", hits.size(), question);
            return hits;
        } catch (Exception e) {
            log.warn("[java8gu] 检索失败：{}", e.toString());
            return List.of();
        }
    }

    // ---------------- 自检 ----------------

    public Map<String, Object> status() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("enabled", isEnabled());
        if (!isEnabled()) {
            m.put("hint", "未装配 RAG：启动未带 -Dtoolbox.java8gu.rag.enabled=true（或 yml enabled=false）");
            return m;
        }
        Java8guRagProperties p = props.get();
        m.put("collection", p.getCollection());
        m.put("qdrant", p.getQdrantHost() + ":" + p.getQdrantPort());
        m.put("embeddingModel", p.getEmbeddingModel());
        m.put("minScore", p.getMinScore());
        try {
            QdrantClient c = qdrantClient.get();
            boolean exists = c.collectionExistsAsync(p.getCollection()).get();
            m.put("collectionExists", exists);
            long points = exists ? c.countAsync(p.getCollection()).get() : 0L;
            m.put("points", points);
            m.put("usable", exists && points > 0);
            if (exists && points == 0) {
                m.put("hint", "集合空——点「重建索引」(POST /api/java8gu/rag/reindex) 灌入卡片");
            }
        } catch (Exception e) {
            m.put("error", e.toString());
            m.put("hint", "连 Qdrant 失败：检查 host/port(gRPC 6334)/api-key 与网络");
        }
        return m;
    }

    /** 内容目录：绝对路径直用；相对路径按工作目录（仓库根）解析。 */
    private Path resolveContentDir() {
        String configured = props.get().getContentDir();
        Path p = Path.of(configured);
        return p.isAbsolute() ? p : Path.of(System.getProperty("user.dir")).resolve(configured);
    }
}
