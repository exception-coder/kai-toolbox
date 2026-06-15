package com.exceptioncoder.toolbox.aisecretary.service;

import com.exceptioncoder.toolbox.aisecretary.config.RagProperties;
import com.exceptioncoder.toolbox.aisecretary.domain.Note;
import com.exceptioncoder.toolbox.aisecretary.repository.NoteRepository;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.store.embedding.EmbeddingMatch;
import dev.langchain4j.store.embedding.EmbeddingSearchRequest;
import dev.langchain4j.store.embedding.EmbeddingStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 回忆态的<b>确定性检索</b>：把原本藏在 AiServices.retrievalAugmentor 内部的召回，拽到代码层显式执行，
 * 让 {@link RecallService} 能拿到「到底召回了哪些真实记录」并原样推给前端。
 *
 * <p>双路 Hybrid：
 * <ul>
 *   <li><b>向量路</b>（RAG 开启时）：question 嵌入 → Qdrant top-k（按 minScore 过滤）→ 命中 id 回库取真值；
 *       擅长「换个说法」的语义模糊召回。</li>
 *   <li><b>关键字路</b>（始终可用，无需向量库）：抽 latin/数字专有名词 LIKE 全表；擅长 Qdrant/admin/svn 这类
 *       向量易漏的专名，也是 RAG 关闭时的唯一路径。</li>
 * </ul>
 * 两路按 noteId 去重合并（都命中则标「向量+关键字」、保留向量分数），向量分降序、关键字独占的追加在后。
 *
 * <p>关键原则：本类只返回<b>库内真实记录</b>，绝不构造/猜测任何字段——模型拿到的永远是既成事实。
 */
@Service
public class RecallRetriever {

    private static final Logger log = LoggerFactory.getLogger(RecallRetriever.class);

    private static final int DEFAULT_MAX_RESULTS = 5;
    private static final double DEFAULT_MIN_SCORE = 0.5;

    private final Optional<EmbeddingModel> embeddingModel;
    private final Optional<EmbeddingStore<TextSegment>> embeddingStore;
    private final Optional<RagProperties> ragProperties;
    private final NoteRepository noteRepository;

    public RecallRetriever(@Qualifier("aiSecretaryEmbeddingModel") Optional<EmbeddingModel> embeddingModel,
                           @Qualifier("aiSecretaryEmbeddingStore") Optional<EmbeddingStore<TextSegment>> embeddingStore,
                           Optional<RagProperties> ragProperties,
                           NoteRepository noteRepository) {
        this.embeddingModel = embeddingModel;
        this.embeddingStore = embeddingStore;
        this.ragProperties = ragProperties;
        this.noteRepository = noteRepository;
    }

    private boolean vectorEnabled() {
        return embeddingModel.isPresent() && embeddingStore.isPresent();
    }

    private int maxResults() {
        return ragProperties.map(RagProperties::getMaxResults).orElse(DEFAULT_MAX_RESULTS);
    }

    private double minScore() {
        return ragProperties.map(RagProperties::getMinScore).orElse(DEFAULT_MIN_SCORE);
    }

    /** 对一句话提问做 Hybrid 检索，返回去重合并后的真实命中（向量分降序，关键字独占追加在后）。 */
    public List<RecallHit> retrieve(String question) {
        // 用 LinkedHashMap 按 noteId 去重并保序（向量先入 → 排前）
        Map<String, RecallHit> merged = new LinkedHashMap<>();

        // ① 向量路
        if (vectorEnabled()) {
            try {
                Embedding q = embeddingModel.get().embed(question).content();
                EmbeddingSearchRequest req = EmbeddingSearchRequest.builder()
                        .queryEmbedding(q)
                        .maxResults(maxResults())
                        .minScore(minScore())
                        .build();
                List<EmbeddingMatch<TextSegment>> matches = embeddingStore.get().search(req).matches();
                for (EmbeddingMatch<TextSegment> m : matches) {
                    Note note = noteRepository.findById(m.embeddingId()); // embeddingId == 入库时的 noteId
                    if (note != null) {
                        merged.put(note.id(), new RecallHit(note, m.score(), "向量"));
                    }
                }
            } catch (Exception e) {
                // 向量路失败软降级——不阻断关键字路（也是 RAG 关闭/Qdrant 不可达时的兜底）
                log.warn("[ai-secretary] 向量召回失败，降级到关键字路：{}", e.toString());
            }
        }

        // ② 关键字路（专名精确命中；与向量重叠则升级来源标记，独占则追加）
        List<String> terms = KeywordContentRetriever.extractTerms(question);
        if (!terms.isEmpty()) {
            for (Note note : noteRepository.searchByTerms(terms, maxResults())) {
                RecallHit existing = merged.get(note.id());
                if (existing != null) {
                    merged.put(note.id(), new RecallHit(note, existing.score(), "向量+关键字"));
                } else {
                    merged.put(note.id(), new RecallHit(note, null, "关键字"));
                }
            }
        }

        List<RecallHit> hits = new ArrayList<>(merged.values());
        log.info("[ai-secretary] 召回 {} 条（向量{}）：q={}", hits.size(), vectorEnabled() ? "开" : "关", question);
        return hits;
    }
}
