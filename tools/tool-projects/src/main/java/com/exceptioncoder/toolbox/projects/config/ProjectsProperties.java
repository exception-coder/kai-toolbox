package com.exceptioncoder.toolbox.projects.config;

import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.Refreshable;
import com.exceptioncoder.toolbox.common.project.LegacyProjectDirectory;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 原单目录项目配置的兼容载体。
 *
 * <p>首次统一保存前仅 root 参与目录合并；扫描规则由项目目录源提供。
 * 保留旧字段以兼容已有配置，统一保存后旧 root 不再影响有效目录。</p>
 */
@Component
@ConfigurationProperties(prefix = "toolbox.projects")
@Refreshable(name = "项目管理")
@Getter
@Setter
public class ProjectsProperties implements LegacyProjectDirectory {

    /** 扫描根目录绝对路径 */
    private String root;

    /** 扫描结果内存缓存 TTL（秒）。≤0 时回退到 5 */
    private int cacheTtlSeconds = 5;

    /** 一级目录名以这些前缀开头时跳过；默认 "."、"_" */
    private List<String> hiddenPrefixes = List.of(".", "_");
}
