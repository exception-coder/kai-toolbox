package com.exceptioncoder.toolbox.prdclarify.config;

import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.Refreshable;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Graphify 代码知识图谱 CLI 查询配置，绑定 {@code toolbox.graphify.*}。
 *
 * <p>直接调用 {@code graphify query} CLI（不经 MCP）：由 {@link com.exceptioncoder.toolbox.prdclarify.service.GraphifyQueryService}
 * 在调 Claude 前先取图谱查询结果，作为「上下文压缩」注入 prompt。标 {@link Refreshable} 纳入运行时配置中心，
 * 二进制路径/超时可在线改不重启。</p>
 */
@Component
@ConfigurationProperties(prefix = "toolbox.graphify")
@Refreshable(name = "Graphify 知识图谱查询")
@Getter
@Setter
public class GraphifyProperties {

    /** 总开关：关闭后 PRD 澄清/开发文档生成跳过知识图谱查询，不影响主流程。 */
    private boolean enabled = true;

    /** graphify CLI 可执行文件。默认走 PATH（pip/uv 安装后即在 PATH），本机非 PATH 安装时用绝对路径覆盖。 */
    private String binary = "graphify";

    /** 单次查询子进程超时（秒）。超时视为查询失败，静默跳过，不阻断 PRD/开发文档生成。 */
    private int timeoutSeconds = 30;

    /** 传给 {@code graphify query --budget} 的 token 预算，控制注入 prompt 的图谱上下文体量。 */
    private int queryBudget = 1500;
}
