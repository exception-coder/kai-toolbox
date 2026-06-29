package com.exceptioncoder.toolbox.visitoranalysis.service;

import com.exceptioncoder.toolbox.visitoranalysis.api.dto.SimilarRecord;
import com.exceptioncoder.toolbox.visitoranalysis.config.VisitorAnalysisRagProperties;
import dev.langchain4j.data.document.Metadata;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.store.embedding.EmbeddingMatch;
import dev.langchain4j.store.embedding.EmbeddingSearchRequest;
import dev.langchain4j.store.embedding.EmbeddingStore;
import io.qdrant.client.QdrantClient;
import io.qdrant.client.grpc.Collections;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * 向量索引 + 语义召回（langchain4j-qdrant + OpenAI 兼容 bge-m3 嵌入），替代原 Python sidecar 的 vector_service。
 *
 * <p>仅索引 / 召回客户去重底库（集合 {@code va_customers}）；判定历史不回灌，避免自我污染。
 * 向量 bean 仅在 {@code toolbox.visitor-analysis.rag.enabled=true} 时存在，故全部 Optional 注入——
 * 关闭或 Qdrant 不可达时所有操作软降级（返回空 / false），绝不抛异常拖垮判别主流程。
 */
@Service
public class VisitorVectorService {

    private static final Logger log = LoggerFactory.getLogger(VisitorVectorService.class);

    private final Optional<EmbeddingModel> embeddingModel;
    private final Optional<EmbeddingStore<TextSegment>> embeddingStore;
    private final Optional<QdrantClient> qdrantClient;
    private final Optional<VisitorAnalysisRagProperties> props;

    public VisitorVectorService(
            @Qualifier("visitorAnalysisEmbeddingModel") Optional<EmbeddingModel> embeddingModel,
            @Qualifier("visitorAnalysisEmbeddingStore") Optional<EmbeddingStore<TextSegment>> embeddingStore,
            @Qualifier("visitorAnalysisQdrantClient") Optional<QdrantClient> qdrantClient,
            Optional<VisitorAnalysisRagProperties> props) {
        this.embeddingModel = embeddingModel;
        this.embeddingStore = embeddingStore;
        this.qdrantClient = qdrantClient;
        this.props = props;
    }

    /** 向量召回是否可用（RAG 开启且 bean 已装配）。 */
    public boolean enabled() {
        return embeddingModel.isPresent() && embeddingStore.isPresent();
    }

    /** 健康探活：RAG 开启且 Qdrant 集合可达。供前端提示「向量召回是否就绪」。 */
    public boolean ping() {
        if (!enabled() || qdrantClient.isEmpty() || props.isEmpty()) return false;
        try {
            return Boolean.TRUE.equals(
                    qdrantClient.get().collectionExistsAsync(props.get().getCollection()).get());
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * 把有信息量的字段拼成一段文本送去嵌入。顺序：归一化公司名 &gt; 归一化地址 &gt; 原始公司名 &gt; 原始地址 &gt; 来访目的，
     * 让最有区分度的信息权重最高（与原 Python {@code _build_text} 单一来源一致）。
     */
    static String buildText(String companyNorm, String addrNorm, String company,
                            String companyAddr, String purpose) {
        List<String> parts = new ArrayList<>();
        for (String p : new String[]{companyNorm, addrNorm, company, companyAddr, purpose}) {
            if (p != null && !p.isBlank()) parts.add(p.trim());
        }
        return String.join(" ", parts);
    }

    /** 字符串 key → 稳定 UUID（Qdrant point id 要求 UUID / 无符号整数）；同 custId 重复同步走 upsert 不产生重复点。 */
    private static String pointId(String collection, String key) {
        return UUID.nameUUIDFromBytes((collection + ":" + key).getBytes(StandardCharsets.UTF_8)).toString();
    }

    /**
     * 同步索引一条客户底库记录到 Qdrant（embed + upsert），返回是否入库成功。
     * custId 作为稳定 point id 的 key，重复同步走 upsert 不重复。
     */
    public boolean indexCustomer(Long custId, String company, String companyNorm,
                                 String companyAddr, String addrNorm, String status) {
        if (!enabled() || props.isEmpty()) return false;
        String text = buildText(companyNorm, addrNorm, company, companyAddr, null);
        if (text.isBlank()) return false;
        try {
            Embedding embedding = embeddingModel.get().embed(text).content();
            Map<String, String> meta = new LinkedHashMap<>();
            meta.put("company", company != null ? company : "");
            meta.put("company_norm", companyNorm != null ? companyNorm : "");
            meta.put("company_addr", companyAddr != null ? companyAddr : "");   // 门牌级地址，供 LLM 判「地址高度相似」
            meta.put("addr_norm", addrNorm != null ? addrNorm : "");
            meta.put("status", status != null ? status : "");
            meta.put("source", "customer");
            String key = custId != null ? String.valueOf(custId)
                    : (!companyNorm.isBlank() ? companyNorm : text);
            String id = pointId(props.get().getCollection(), key);
            embeddingStore.get().addAll(List.of(id), List.of(embedding),
                    List.of(TextSegment.from(text, Metadata.from(meta))));
            return true;
        } catch (Exception e) {
            log.warn("[visitor-analysis] 向量索引客户失败 custId={}: {}", custId, e.toString());
            return false;
        }
    }

    /**
     * 批量索引：一次 embedAll 把整批文本嵌入（单次 HTTP 往返），再一次 addAll 整批 upsert，
     * 取代逐条 embed+upsert 的 N 次往返，大幅加快「一键同步至向量库」。
     * 入参为待索引客户列表，返回成功入库的行主键 id 列表（供上层据此置同步标记，按主键而非 custId
     * 以兼容无 custId 的人工录入记录）。文本为空的记录跳过；任何异常软降级返回空列表（不抛，避免拖垮调用方）。
     */
    public List<Long> indexCustomersBatch(List<CustomerToIndex> items) {
        if (!enabled() || props.isEmpty() || items == null || items.isEmpty()) return List.of();
        List<String> pointIds = new ArrayList<>();
        List<TextSegment> segments = new ArrayList<>();
        List<Long> rowIds = new ArrayList<>();
        String coll = props.get().getCollection();
        for (CustomerToIndex it : items) {
            String text = buildText(it.companyNorm(), it.addrNorm(), it.company(), it.companyAddr(), null);
            if (text.isBlank()) continue;
            Map<String, String> meta = new LinkedHashMap<>();
            meta.put("company", it.company() != null ? it.company() : "");
            meta.put("company_norm", it.companyNorm() != null ? it.companyNorm() : "");
            meta.put("company_addr", it.companyAddr() != null ? it.companyAddr() : "");
            meta.put("addr_norm", it.addrNorm() != null ? it.addrNorm() : "");
            meta.put("status", it.status() != null ? it.status() : "");
            meta.put("source", "customer");
            String key = it.custId() != null ? String.valueOf(it.custId())
                    : (!it.companyNorm().isBlank() ? it.companyNorm() : text);
            pointIds.add(pointId(coll, key));
            segments.add(TextSegment.from(text, Metadata.from(meta)));
            rowIds.add(it.id());
        }
        if (segments.isEmpty()) return List.of();
        try {
            long t0 = System.nanoTime();
            List<Embedding> embeddings = embeddingModel.get().embedAll(segments).content();
            long embedMs = (System.nanoTime() - t0) / 1_000_000;
            long t1 = System.nanoTime();
            embeddingStore.get().addAll(pointIds, embeddings, segments);
            long upsertMs = (System.nanoTime() - t1) / 1_000_000;
            log.info("[visitor-analysis] 批量向量索引 {} 条：嵌入 {}ms（{}ms/条），Qdrant 写入 {}ms",
                    segments.size(), embedMs, embedMs / segments.size(), upsertMs);
            return rowIds;
        } catch (Exception e) {
            log.warn("[visitor-analysis] 批量向量索引失败（{} 条）: {}", segments.size(), e.toString());
            return List.of();
        }
    }

    /** 批量索引入参：一条待嵌入的客户底库记录。{@code id} 为行主键，用于上层回标同步。 */
    public record CustomerToIndex(long id, Long custId, String company, String companyNorm,
                                  String companyAddr, String addrNorm, String status) {
    }

    /**
     * 召回与新申请最相似的历史客户记录（top-k，按相似度降序）。任何失败返回空列表，调用方不感知。
     */
    public List<SimilarRecord> searchSimilar(String company, String companyNorm,
                                             String companyAddr, String addrNorm, String purpose) {
        if (!enabled() || props.isEmpty()) return List.of();
        String text = buildText(companyNorm, addrNorm, company, companyAddr, purpose);
        if (text.isBlank()) return List.of();
        try {
            Embedding q = embeddingModel.get().embed(text).content();
            EmbeddingSearchRequest req = EmbeddingSearchRequest.builder()
                    .queryEmbedding(q)
                    .maxResults(props.get().getMaxResults())
                    .minScore(props.get().getMinScore())
                    .build();
            List<EmbeddingMatch<TextSegment>> matches = embeddingStore.get().search(req).matches();
            List<SimilarRecord> out = new ArrayList<>();
            for (EmbeddingMatch<TextSegment> m : matches) {
                Metadata meta = m.embedded() != null ? m.embedded().metadata() : new Metadata();
                out.add(new SimilarRecord(
                        metaOr(meta, "company", metaOr(meta, "company_norm", "")),
                        metaOr(meta, "company_addr", metaOr(meta, "addr_norm", "")),
                        emptyToNull(metaOr(meta, "identity", "")),
                        emptyToNull(metaOr(meta, "relationship", "")),
                        m.score(),
                        metaOr(meta, "source", "customer"),
                        null));
            }
            if (!out.isEmpty()) {
                log.info("[visitor-analysis] 向量召回 {} 条（最高 {}）", out.size(),
                        String.format("%.2f", out.get(0).score()));
            }
            return out;
        } catch (Exception e) {
            log.warn("[visitor-analysis] 向量召回失败,降级为无召回上下文: {}", e.toString());
            return List.of();
        }
    }

    /** 清空客户底库向量集合的全部点（集合本身保留）。返回 {ok, before, after} 或 {ok:false, error}。 */
    public Map<String, Object> clearCustomers() {
        if (!enabled() || qdrantClient.isEmpty() || props.isEmpty()) {
            return Map.of("ok", false, "error", "向量召回未启用（toolbox.visitor-analysis.rag.enabled=false 或 Qdrant 不可用）");
        }
        String coll = props.get().getCollection();
        try {
            QdrantClient c = qdrantClient.get();
            long before = c.countAsync(coll).get();
            // 清空全部点：删集合后按原维度+余弦距离重建（与原 Python「清空集合内点、集合保留」等效，
            // 且避免依赖 grpc Filter 类型；本机单用户工具无并发写入顾虑）。
            c.deleteCollectionAsync(coll).get();
            c.createCollectionAsync(coll, Collections.VectorParams.newBuilder()
                    .setSize(props.get().getVectorSize())
                    .setDistance(Collections.Distance.Cosine)
                    .build()).get();
            long after = c.countAsync(coll).get();
            log.info("[visitor-analysis] 清空向量集合 {}: {} -> {}", coll, before, after);
            return Map.of("ok", true, "before", before, "after", after);
        } catch (Exception e) {
            log.warn("[visitor-analysis] clearCustomers 失败: {}", e.toString());
            return Map.of("ok", false, "error", e.toString());
        }
    }

    private static String metaOr(Metadata meta, String key, String fallback) {
        String v = meta.getString(key);
        return (v == null || v.isBlank()) ? fallback : v;
    }

    private static String emptyToNull(String s) {
        return (s == null || s.isBlank()) ? null : s;
    }
}
