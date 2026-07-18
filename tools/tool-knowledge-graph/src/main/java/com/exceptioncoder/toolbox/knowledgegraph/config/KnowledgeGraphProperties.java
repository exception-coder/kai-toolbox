package com.exceptioncoder.toolbox.knowledgegraph.config;

import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.ConfigDesc;
import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.Refreshable;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 知识图谱管理工具配置：两个集中式知识库仓库的本地路径 + node 可执行文件。
 *
 * <p>这三项因人而异（每台开发机 clone 仓库的位置不同），不写死在 application.yml——
 * 纳入运行时动态配置中心（{@link Refreshable}），在「配置中心」页面按需填写，DB 覆盖、改后立即生效不用重启。</p>
 */
@Data
@Component
@ConfigurationProperties(prefix = "toolbox.knowledge-graph")
@Refreshable(name = "知识图谱仓库路径")
public class KnowledgeGraphProperties {

    @ConfigDesc("project-domain-knowledge 仓库本地路径，如 D:/Users/你/myWork/project-domain-knowledge；未配置时 domain-knowledge 检测/初始化不可用")
    private String domainKnowledgeRepoPath;

    @ConfigDesc("cross-project-topology 仓库本地路径；未配置时 cross-topology 检测/初始化不可用")
    private String crossTopologyRepoPath;

    @ConfigDesc("node 可执行文件路径，默认取 PATH 中的 node")
    private String nodeExecutable = "node";
}
