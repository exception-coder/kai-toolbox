package com.exceptioncoder.toolbox.java8gu.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Java 八股复习秘书的向量 RAG 配置。默认 enabled=false——开启前置同个人秘书：
 * {@code ollama pull bge-m3} + 可达的 Qdrant。关闭时整套 RAG bean 不装配。
 *
 * <p>独立集合 {@code java8gu_cards}，与个人秘书 {@code ai_secretary_notes} 物理隔离，互不污染检索。
 * Qdrant / 嵌入连接参数与个人秘书同源（同一 Qdrant、同一 bge-m3）——后续会抽公共 rag 基础设施，
 * 当前先各自持有，规避改动刚稳定的 ai-secretary 模块。
 */
@Data
@ConfigurationProperties("toolbox.java8gu.rag")
public class Java8guRagProperties {

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
    private String qdrantApiKey = "";
    private String collection = "java8gu_cards";

    /** 检索 top-k 与最低相似度阈值（curated 内容，阈值同个人秘书 0.45）。 */
    private int maxResults = 6;
    private double minScore = 0.45;

    /**
     * 八股卡片内容目录（含 index.json 与 q/{id}.md）。默认指向仓库内前端静态目录，
     * 后端按 user.dir（仓库根 / 工作目录）解析；可用此属性覆盖为绝对路径。
     */
    private String contentDir = "frontend/public/java8gu";
}
