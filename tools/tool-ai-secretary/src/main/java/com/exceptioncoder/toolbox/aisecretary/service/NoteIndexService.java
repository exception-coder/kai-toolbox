package com.exceptioncoder.toolbox.aisecretary.service;

import dev.langchain4j.data.document.Metadata;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.store.embedding.EmbeddingStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Optional;

/**
 * 笔记向量索引：把 note 文本嵌入并写入向量库，删除时移除。
 *
 * <p>嵌入模型 / 向量库 bean 仅在 RAG 开启时存在，故用 Optional 注入——关闭时整类 no-op，
 * 且所有操作失败软降级（catch + log），绝不阻断 capture / 删除主流程。
 */
@Service
public class NoteIndexService {

    private static final Logger log = LoggerFactory.getLogger(NoteIndexService.class);

    private final Optional<EmbeddingModel> embeddingModel;
    private final Optional<EmbeddingStore<TextSegment>> embeddingStore;

    public NoteIndexService(@Qualifier("aiSecretaryEmbeddingModel") Optional<EmbeddingModel> embeddingModel,
                            @Qualifier("aiSecretaryEmbeddingStore") Optional<EmbeddingStore<TextSegment>> embeddingStore) {
        this.embeddingModel = embeddingModel;
        this.embeddingStore = embeddingStore;
    }

    private boolean enabled() {
        return embeddingModel.isPresent() && embeddingStore.isPresent();
    }

    /** 以 noteId 为向量点 id 写入（upsert）；文本为空或 RAG 关闭则跳过。 */
    public void index(String noteId, String text) {
        if (!enabled() || !StringUtils.hasText(text)) {
            return;
        }
        try {
            Embedding embedding = embeddingModel.get().embed(text).content();
            embeddingStore.get().addAll(
                    List.of(noteId),
                    List.of(embedding),
                    List.of(TextSegment.from(text, Metadata.from("noteId", noteId))));
        } catch (Exception e) {
            log.warn("[ai-secretary] 向量索引失败 noteId={}: {}", noteId, e.toString());
        }
    }

    public void remove(String noteId) {
        if (!enabled()) {
            return;
        }
        try {
            embeddingStore.get().remove(noteId);
        } catch (Exception e) {
            log.warn("[ai-secretary] 向量删除失败 noteId={}: {}", noteId, e.toString());
        }
    }
}
