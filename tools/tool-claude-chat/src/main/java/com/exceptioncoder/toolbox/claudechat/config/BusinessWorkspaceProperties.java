package com.exceptioncoder.toolbox.claudechat.config;

import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.Refreshable;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.nio.file.Path;

/** 由 kai-toolbox 托管的业务系统源码目录与 Git 命令限制。 */
@Component
@ConfigurationProperties(prefix = "toolbox.claude-chat.business-workspace")
@Refreshable(name = "业务系统源码")
@Getter
@Setter
public class BusinessWorkspaceProperties {

    /** 业务源码根目录；空白时使用 ~/.kai-toolbox/sources。 */
    private String root = "";

    /** 单个 clone、fetch 或 pull 命令最大执行时间。 */
    private long commandTimeoutMs = 600_000L;

    public Path resolveRoot() {
        if (root == null || root.isBlank()) {
            return Path.of(System.getProperty("user.home"), ".kai-toolbox", "sources")
                    .toAbsolutePath().normalize();
        }
        String configured = root.trim();
        if (configured.equals("~")) {
            configured = System.getProperty("user.home");
        } else if (configured.startsWith("~/") || configured.startsWith("~\\")) {
            configured = Path.of(System.getProperty("user.home"), configured.substring(2)).toString();
        }
        return Path.of(configured).toAbsolutePath().normalize();
    }
}
