package com.exceptioncoder.toolbox.knowledgegraph.config;

import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.ConfigDesc;
import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.Refreshable;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.nio.file.Path;

/**
 * 知识图谱管理工具配置：团队初始化仓库的约定路径 + node 可执行文件。
 *
 * <p>两个仓库统一位于 {@code ~/.kai-toolbox/team-tools}，用户只需先完成团队依赖初始化。</p>
 */
@Data
@Component
@ConfigurationProperties(prefix = "toolbox.knowledge-graph")
@Refreshable(name = "知识图谱仓库路径")
public class KnowledgeGraphProperties {

    @ConfigDesc("node 可执行文件路径，默认取 PATH 中的 node")
    private String nodeExecutable = "node";

    public String getDomainKnowledgeRepoPath() {
        return teamToolPath("project-domain-knowledge");
    }

    public String getCrossTopologyRepoPath() {
        return teamToolPath("cross-project-topology");
    }

    private static String teamToolPath(String repository) {
        return Path.of(System.getProperty("user.home"), ".kai-toolbox", "team-tools", repository).toString();
    }
}
