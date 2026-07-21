package com.exceptioncoder.toolbox.prdclarify.config;

import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.Refreshable;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 业务知识图谱（project-domain-knowledge）查询配置，绑定 {@code toolbox.domain-knowledge-query.*}。
 *
 * <p>仓库路径本身复用 {@code tool-knowledge-graph} 模块已有的
 * {@code toolbox.knowledge-graph.domain-knowledge-repo-path} 配置（用户已在配置中心填过，不用
 * 重复配置），此处只放查询本身的开关/超时/结果条数——与 {@link GraphifyProperties} 同样的
 * 「直接跑脚本，不经 MCP」思路：由 {@link com.exceptioncoder.toolbox.prdclarify.service.DomainKnowledgeQueryService}
 * 在调 Claude 前直接 import 该仓库编译产物 {@code dist/knowledge.js} 做检索，取结果作为「上下文压缩」
 * 拼进工时评估 prompt，跟 graphify 代码知识图谱同一套「查询结果当已知事实喂给 LLM」的用法。</p>
 */
@Component
@ConfigurationProperties(prefix = "toolbox.domain-knowledge-query")
@Refreshable(name = "业务知识图谱查询（工时评估用）")
@Getter
@Setter
public class DomainKnowledgeQueryProperties {

    /** 总开关：关闭后工时评估跳过业务知识图谱查询，只用 PRD/开发文档内容本身评估。 */
    private boolean enabled = true;

    /** node 可执行文件，默认走 PATH。 */
    private String nodeExecutable = "node";

    /** 单次查询子进程超时（秒）。 */
    private int timeoutSeconds = 20;

    /** 检索返回的知识点条数上限，控制注入 prompt 的体量。 */
    private int resultLimit = 5;
}
