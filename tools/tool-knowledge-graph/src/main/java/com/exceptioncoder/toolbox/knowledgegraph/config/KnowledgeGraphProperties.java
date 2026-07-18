package com.exceptioncoder.toolbox.knowledgegraph.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/** 知识图谱管理工具配置：两个集中式知识库仓库的本地路径 + node 可执行文件。 */
@Data
@Component
@ConfigurationProperties(prefix = "toolbox.knowledge-graph")
public class KnowledgeGraphProperties {

    /** project-domain-knowledge 仓库本地路径，如 D:/Users/zhang/myWork/project-domain-knowledge */
    private String domainKnowledgeRepoPath;

    /** cross-project-topology 仓库本地路径 */
    private String crossTopologyRepoPath;

    /** node 可执行文件路径，默认取 PATH 中的 node */
    private String nodeExecutable = "node";
}
