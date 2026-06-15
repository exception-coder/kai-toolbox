package com.exceptioncoder.toolbox.aisecretary.service;

import com.exceptioncoder.toolbox.aisecretary.config.RagProperties;
import io.qdrant.client.PointIdFactory;
import io.qdrant.client.QdrantClient;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

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

    public RagStatusService(@Qualifier("aiSecretaryQdrantClient") Optional<QdrantClient> client,
                            Optional<RagProperties> props) {
        this.client = client;
        this.props = props;
    }

    /** RAG 是否装配（启动带了 enabled=true 且 Qdrant client bean 存在）。 */
    public boolean isEnabled() {
        return client.isPresent() && props.isPresent();
    }

    /**
     * 在给定 noteId 中，<b>实际存在于 Qdrant</b> 的那批（实时查真实存在性，用于时间轴"是否已入向量库"标记）。
     * RAG 关、入参空或查询出错一律返回空集——绝不阻断时间轴渲染。调用方据 {@link #isEnabled()} 区分"未知"。
     */
    public Set<String> existingIds(Collection<String> noteIds) {
        if (!isEnabled() || noteIds == null || noteIds.isEmpty()) {
            return Set.of();
        }
        try {
            // 用 var 让编译器从 PointIdFactory.id(...) 的返回类型自行推断 List<Points.PointId>，
            // 避免在源码里直接书写 Points.PointId（该 protobuf 生成类名在本环境 javac 下解析异常）。
            var ids = noteIds.stream()
                    .filter(RagStatusService::isUuid)
                    .map(id -> PointIdFactory.id(UUID.fromString(id)))
                    .collect(Collectors.toList());
            if (ids.isEmpty()) {
                return Set.of();
            }
            var points = client.get()
                    .retrieveAsync(props.get().getCollection(), ids, false, false, null).get();
            return points.stream()
                    .map(p -> p.getId().getUuid())
                    .filter(StringUtils::hasText)
                    .map(s -> s.toLowerCase())
                    .collect(Collectors.toSet());
        } catch (Exception e) {
            return Set.of();
        }
    }

    private static boolean isUuid(String s) {
        try {
            UUID.fromString(s);
            return true;
        } catch (Exception e) {
            return false;
        }
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
