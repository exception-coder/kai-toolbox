package com.exceptioncoder.toolbox.visitoranalysis.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 启用 @Scheduled 调度，驱动客户新增审批同步（拉取登记 + 异步判别）的定时任务。
 * toolbox-starter 未默认开启 scheduling；本工具按需启用。@EnableScheduling 作用于整个
 * ApplicationContext，Spring 对调度后置处理器去重为单例，与其它工具的 @EnableScheduling 互不影响。
 */
@Configuration
@EnableScheduling
public class VisitorAnalysisSchedulingConfig {
}
