package com.exceptioncoder.toolbox.visitoranalysis.config;

import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.ConfigDesc;
import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.Refreshable;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 访客分析向量召回配置（{@code toolbox.visitor-analysis.rag.*}）。
 *
 * <p>默认 {@code enabled=false}——开启前置：① {@code ollama pull bge-m3} ② 可达的 Qdrant。
 * 关闭时整套向量 bean 不装配，灰区分类退化为「不带历史召回上下文」（仍可判别，只是少了相似客户参考）。
 * 与 {@code tool-ai-secretary} 的 RAG 同一套嵌入/向量库口径，但用独立集合 {@code va_customers}，物理隔离。
 *
 * <p>标 {@link Refreshable} 纳入运行时配置中心：Qdrant 地址 / 端口 / API Key / 集合 / 嵌入端点等可在配置中心
 * 查看与修改并持久化（SQLite），便于发布到不同环境时动态配置实际的 Qdrant 地址与密钥。
 * <b>注意</b>：向量 bean（QdrantClient / EmbeddingStore / EmbeddingModel）在启动时按这些值构建，
 * 故 host / port / api-key / enabled 等连接相关项改后需<b>重启 agent</b> 才会重建连接生效；
 * max-results / min-score 这类纯召回参数由 service 每次调用实时读取，改后即时生效。
 */
@Data
@Component
@ConfigurationProperties("toolbox.visitor-analysis.rag")
@Refreshable(name = "访客分析向量库", group = "访客分析")
public class VisitorAnalysisRagProperties {

    @ConfigDesc("总开关：开启后才装配嵌入模型 + Qdrant 向量库用于灰区判别的相似客户召回；改后需重启 agent 生效")
    private boolean enabled = false;

    /** 嵌入模型走 OpenAI 兼容端点（本地 Ollama）。 */
    @ConfigDesc("嵌入模型的 OpenAI 兼容端点（本地 Ollama，如 http://localhost:11434/v1）；改后需重启生效")
    private String embeddingBaseUrl = "http://localhost:11434/v1";
    @ConfigDesc("嵌入端点的 API Key（本地 Ollama 填 ollama 即可）；改后需重启生效")
    private String embeddingApiKey = "ollama";
    @ConfigDesc("嵌入模型名（默认 bge-m3，须先 ollama pull bge-m3）；改后需重启生效")
    private String embeddingModel = "bge-m3";
    /** bge-m3 原生维度；换模型须同步改并重建集合。 */
    @ConfigDesc("向量维度（bge-m3 原生 1024）；换模型须同步改此值并重建集合；改后需重启生效")
    private int vectorSize = 1024;

    /** Qdrant gRPC 端口是 6334（REST 是 6333）。 */
    @ConfigDesc("Qdrant 主机地址（不含端口，如 127.0.0.1 或远程 IP）；发布时按环境配置；改后需重启生效")
    private String qdrantHost = "localhost";
    @ConfigDesc("Qdrant gRPC 端口（默认 6334，REST 是 6333）；改后需重启生效")
    private int qdrantPort = 6334;
    @ConfigDesc("是否用 TLS 连接 Qdrant；改后需重启生效")
    private boolean qdrantUseTls = false;
    /** Qdrant 开启 API Key 认证时填；须与 Qdrant 的 SERVICE__API_KEY 一致。留空=不认证。 */
    @ConfigDesc("Qdrant API Key（Qdrant 开启认证时填，须与其 SERVICE__API_KEY 一致；留空=不认证）；改后需重启生效")
    private String qdrantApiKey = "";
    /** 客户去重底库集合（仅此集合参与召回，判定历史不回灌，避免自我污染）。 */
    @ConfigDesc("向量集合名（客户去重底库专用，默认 va_customers，与 ai-secretary 物理隔离）；改后需重启生效")
    private String collection = "va_customers";

    /** 召回 top-k 与最低相似度阈值（沿用 sidecar 的 limit=3 / 阈值 0.70）。 */
    @ConfigDesc("召回 top-k（返回最相似的前 N 条历史客户作判别参考，默认 3）；调用时实时读取，改后即时生效")
    private int maxResults = 3;
    @ConfigDesc("召回最低相似度阈值（0~1，低于此值的相似记录丢弃，默认 0.70）；调用时实时读取，改后即时生效")
    private double minScore = 0.70;
}
