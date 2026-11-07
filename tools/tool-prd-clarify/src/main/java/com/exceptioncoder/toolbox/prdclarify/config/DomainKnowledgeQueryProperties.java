package com.exceptioncoder.toolbox.prdclarify.config;

import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.Refreshable;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/** 项目内业务资料查询配置；保留旧配置键兼容，旧引擎路径与子进程参数不再使用。 */
@Component
@ConfigurationProperties(prefix = "toolbox.domain-knowledge-query")
@Refreshable(name = "业务知识图谱查询（工时评估用）")
@Getter
@Setter
public class DomainKnowledgeQueryProperties {

    /** 总开关：关闭后工时评估跳过业务知识图谱查询，只用 PRD/开发文档内容本身评估。 */
    private boolean enabled = true;

    /** 兼容旧配置，已停用，不启动 Node 引擎。 */
    private String nodeExecutable = "node";

    /** 兼容旧配置，已停用。 */
    private int timeoutSeconds = 20;

    /** 检索返回的知识点条数上限，控制注入 prompt 的体量。 */
    private int resultLimit = 5;
}
