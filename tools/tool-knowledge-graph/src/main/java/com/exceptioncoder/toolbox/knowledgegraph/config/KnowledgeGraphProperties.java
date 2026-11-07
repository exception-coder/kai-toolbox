package com.exceptioncoder.toolbox.knowledgegraph.config;

import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.ConfigDesc;
import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.Refreshable;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 图谱管理兼容配置，项目业务知识随项目维护。
 */
@Data
@Component
@ConfigurationProperties(prefix = "toolbox.knowledge-graph")
@Refreshable(name = "知识图谱仓库路径")
public class KnowledgeGraphProperties {

    @ConfigDesc("node 可执行文件路径，默认取 PATH 中的 node")
    private String nodeExecutable = "node";

    public String getDomainKnowledgeRepoPath() {
        return ""; // Retired compatibility field; never resolve or restore a global knowledge repository.
    }

    public String getCrossTopologyRepoPath() {
        return "";
    }

}
