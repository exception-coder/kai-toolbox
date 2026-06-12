package com.exceptioncoder.toolbox.aisecretary.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * AI 秘书向量 RAG 配置。默认 enabled=false——需先 `ollama pull bge-m3` 且启动 Qdrant
 * 才能开启；关闭时整套 RAG bean 不装配，capture/recall 退回非语义路径。
 */
@Data
@ConfigurationProperties("toolbox.ai-secretary.rag")
public class RagProperties {

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
    private String collection = "ai_secretary_notes";

    /** 检索 top-k 与最低相似度阈值。 */
    private int maxResults = 5;
    private double minScore = 0.45;
}
