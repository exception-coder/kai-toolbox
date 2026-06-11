package com.exceptioncoder.toolbox.projects.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 「项目管理」面板配置项。
 *
 * <p>绑定 {@code toolbox.projects.*}。修改后 5 秒（{@link #cacheTtlSeconds}）内的扫描请求仍读旧值。</p>
 */
@Component
@ConfigurationProperties(prefix = "toolbox.projects")
@Getter
@Setter
public class ProjectsProperties {

    /** 扫描根目录绝对路径 */
    private String root;

    /** 扫描结果内存缓存 TTL（秒）。≤0 时回退到 5 */
    private int cacheTtlSeconds = 5;

    /** 一级目录名以这些前缀开头时跳过；默认 "."、"_" */
    private List<String> hiddenPrefixes = List.of(".", "_");

    /** git 可执行（默认走 PATH 的 git；本机非 PATH 安装时填绝对路径） */
    private String gitBinary = "git";

    /** 「提交记录」默认拉取条数 */
    private int commitLimitDefault = 30;

    /** 「提交记录」单次拉取条数上限 */
    private int commitLimitMax = 100;

    /** 单条 diff 输出字节上限，超出截断（防大提交撑爆响应） */
    private int diffMaxBytes = 1024 * 1024;

    /** git 子进程超时（毫秒） */
    private int gitTimeoutMs = 5000;
}
