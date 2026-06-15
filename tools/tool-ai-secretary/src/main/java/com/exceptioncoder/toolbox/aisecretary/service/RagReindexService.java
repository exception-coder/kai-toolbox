package com.exceptioncoder.toolbox.aisecretary.service;

import com.exceptioncoder.toolbox.aisecretary.config.RagProperties;
import com.exceptioncoder.toolbox.aisecretary.domain.Note;
import com.exceptioncoder.toolbox.aisecretary.repository.NoteRepository;
import io.qdrant.client.QdrantClient;
import io.qdrant.client.grpc.Collections;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * RAG 对账触发：以 SQLite（唯一真相源）为准，把向量库重建到与库一致。
 *
 * <p>{@code POST /api/ai-secretary/rag/reindex} 调用。修双写漂移用——确保集合存在 → 全量重嵌入 upsert
 * （按 noteId 幂等）→ 回报重建条数与重建后真实点数。任何错误直接进 HTTP 响应，不必扒日志。
 */
@Service
public class RagReindexService {

    private static final Logger log = LoggerFactory.getLogger(RagReindexService.class);

    private final Optional<QdrantClient> client;
    private final Optional<RagProperties> props;
    private final NoteRepository noteRepository;
    private final NoteIndexService noteIndexService;
    private final RagStatusService ragStatusService;

    public RagReindexService(@Qualifier("aiSecretaryQdrantClient") Optional<QdrantClient> client,
                             Optional<RagProperties> props,
                             NoteRepository noteRepository, NoteIndexService noteIndexService,
                             RagStatusService ragStatusService) {
        this.client = client;
        this.props = props;
        this.noteRepository = noteRepository;
        this.noteIndexService = noteIndexService;
        this.ragStatusService = ragStatusService;
    }

    public Map<String, Object> reindex() {
        Map<String, Object> m = new LinkedHashMap<>();
        if (!ragStatusService.isEnabled()) {
            m.put("enabled", false);
            m.put("hint", "RAG 未启用：启动需带 -Dtoolbox.ai-secretary.rag.enabled=true（走 run-supervised.ps1）");
            return m;
        }
        m.put("enabled", true);
        try {
            ensureCollection();
            List<Note> notes = noteRepository.findRecent(10000);
            for (Note n : notes) {
                noteIndexService.index(n.id(), n.rawText()); // 失败软降级（catch+log），不中断整批
            }
            log.info("[ai-secretary] RAG 手动重建索引 {} 条", notes.size());
            m.put("reindexed", notes.size());
        } catch (Exception e) {
            m.put("error", e.toString());
        }
        // 合并真实状态（集合是否存在 / 点数 / usable），让响应自证结果
        m.putAll(ragStatusService.status());
        return m;
    }

    /** 集合不存在则按维度 + 余弦创建（与启动时 RagConfig 一致；on-demand 兜底）。 */
    private void ensureCollection() throws Exception {
        QdrantClient c = client.get();
        RagProperties p = props.get();
        if (Boolean.TRUE.equals(c.collectionExistsAsync(p.getCollection()).get())) {
            return;
        }
        c.createCollectionAsync(
                p.getCollection(),
                Collections.VectorParams.newBuilder()
                        .setSize(p.getVectorSize())
                        .setDistance(Collections.Distance.Cosine)
                        .build())
                .get();
        log.info("[ai-secretary] RAG 重建：创建缺失集合 {} (dim={})", p.getCollection(), p.getVectorSize());
    }
}
