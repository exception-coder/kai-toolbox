package com.exceptioncoder.toolbox.claudechat.config;

import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.Refreshable;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 新建会话时的「工作目录选择」配置，前缀 {@code toolbox.claude-chat.workspace}。
 *
 * <p>仅扫描各 root 的一级子目录，供前端下拉选 cwd。roots 为空时接口返回空列表（不报错）。
 * 标 {@link Refreshable} 纳入运行时动态配置中心，可在线改不重启。</p>
 */
@Component
@ConfigurationProperties(prefix = "toolbox.claude-chat.workspace")
@Refreshable(name = "Claude 工作目录")
@Getter
@Setter
public class WorkspaceProperties {

    /** 扫描根目录绝对路径，支持多个。为空时不扫描。 */
    private List<String> roots = List.of();

    /** 扫描结果内存缓存 TTL（秒）。≤0 时回退到 5。 */
    private int cacheTtlSeconds = 5;

    /** 子目录名以这些前缀开头时跳过；默认 "."、"_"，对齐项目管理面板。 */
    private List<String> hiddenPrefixes = List.of(".", "_");

    /**
     * 知识库（project-domain-knowledge）本地 clone 的 {@code knowledge/} 目录绝对路径。
     *
     * <p>配置后，「项目工作台」列模块时优先读 {@code {knowledgeBaseDir}/{项目目录名}/impl/modules.json}
     * （项目目录名 == 知识库 project key，须一致），按其中声明的业务模块树 + 代码路径渲染可点列表；
     * 找不到该文件时回退到「按构建标志文件自动识别」。为空 = 不启用，始终走自动识别。</p>
     *
     * <p>后端只读本地文件，不联网、不执行 git；保持本地最新需自行 {@code git pull}。</p>
     */
    private String knowledgeBaseDir = "";
}
