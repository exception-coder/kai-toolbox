package com.exceptioncoder.toolbox.downloader.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 启用 @Scheduled 调度，让 ProgressBus.flush 周期性触发。
 * toolbox-starter 未默认开启 scheduling；本工具按需启用，且作用域为整个 ApplicationContext，
 * 与其他工具的 @Scheduled 互不影响。
 */
@Configuration
@EnableScheduling
public class DownloaderSchedulingConfig {
}
