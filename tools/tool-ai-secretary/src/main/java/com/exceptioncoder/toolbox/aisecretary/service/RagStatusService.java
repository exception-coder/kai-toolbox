package com.exceptioncoder.toolbox.aisecretary.service;

import com.exceptioncoder.toolbox.aisecretary.config.RagProperties;
import io.qdrant.client.QdrantClient;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * RAG 自检：一眼看清「向量检索到底有没有真正在工作」，终结「RAG 开没开 / 集合有没有数据」的反复猜测。
 *
 * <p>暴露为 {@code GET /api/ai-secretary/rag/status}：enabled=false 说明本进程没装配 RAG
 * （多半是启动没带 {@code -Dtoolbox.ai-secretary.rag.enabled=true}）；enabled=true 但 points=0
 * 说明集合空（回填没成功）；points>0 才是真正可用。
 */
@Service
public class RagStatusService {

    private final Optional<QdrantClient> client;
    private final Optional<RagProperties> props;

    public RagStatusService(Optional<QdrantClient> client, Optional<RagProperties> props) {
        this.client = client;
        this.props = props;
    }

    public Map<String, Object> status() {
        Map<String, Object> m = new LinkedHashMap<>();
        boolean enabled = client.isPresent() && props.isPresent();
        m.put("enabled", enabled);
        if (!enabled) {
            m.put("hint", "本进程未装配 RAG：启动时未带 -Dtoolbox.ai-secretary.rag.enabled=true（或 yml enabled=false）");
            return m;
        }
        RagProperties p = props.get();
        m.put("collection", p.getCollection());
        m.put("qdrant", p.getQdrantHost() + ":" + p.getQdrantPort());
        m.put("embeddingModel", p.getEmbeddingModel());
        m.put("minScore", p.getMinScore());
        try {
            boolean exists = client.get().collectionExistsAsync(p.getCollection()).get();
            m.put("collectionExists", exists);
            long points = exists ? client.get().countAsync(p.getCollection()).get() : 0L;
            m.put("points", points);
            m.put("usable", exists && points > 0);
            if (!exists) {
                m.put("hint", "集合不存在——启动建集合那步没成功（看启动日志 [ai-secretary] 创建/跳过 行）");
            } else if (points == 0) {
                m.put("hint", "集合空——回填没写进去（看启动日志 [ai-secretary] RAG 启动回填 N 条 与向量写入告警）");
            }
        } catch (Exception e) {
            m.put("error", e.toString());
            m.put("hint", "连 Qdrant 失败：检查 host/port(gRPC 6334)/api-key 与网络");
        }
        return m;
    }
}
