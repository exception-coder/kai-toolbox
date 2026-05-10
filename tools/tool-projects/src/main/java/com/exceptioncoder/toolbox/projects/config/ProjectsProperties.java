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
}
