package com.exceptioncoder.toolbox.visitoranalysis.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 访客分析向量召回配置（{@code toolbox.visitor-analysis.rag.*}）。
 *
 * <p>默认 {@code enabled=false}——开启前置：① {@code ollama pull bge-m3} ② 启动 Qdrant。
 * 关闭时整套向量 bean 不装配，灰区分类退化为「不带历史召回上下文」（仍可判别，只是少了相似客户参考）。
 * 与 {@code tool-ai-secretary} 的 RAG 同一套嵌入/向量库口径，但用独立集合 {@code va_customers}，物理隔离。
 */
@Data
@ConfigurationProperties("toolbox.visitor-analysis.rag")
public class VisitorAnalysisRagProperties {

    private boolean enabled = false;

    /** 嵌入模型走 OpenAI 兼容端点（本地 Ollama）。 */
    private String embeddingBaseUrl = "http://localhost:11434/v1";
    private String embeddingApiKey = "ollama";
    private String embeddingModel = "bge-m3";
    /** bge-m3 原生维度；换模型须同步改并重建集合。 */
    private int vectorSize = 1024;

    /** Qdrant gRPC 端口是 6334（REST 是 6333）。 */
    private String qdrantHost = "localhost";
    private int qdrantPort = 6334;
    private boolean qdrantUseTls = false;
    /** Qdrant 开启 API Key 认证时填；须与 Qdrant 的 SERVICE__API_KEY 一致。留空=不认证。 */
    private String qdrantApiKey = "";
    /** 客户去重底库集合（仅此集合参与召回，判定历史不回灌，避免自我污染）。 */
    private String collection = "va_customers";

    /** 召回 top-k 与最低相似度阈值（沿用 sidecar 的 limit=3 / 阈值 0.70）。 */
    private int maxResults = 3;
    private double minScore = 0.70;
}
