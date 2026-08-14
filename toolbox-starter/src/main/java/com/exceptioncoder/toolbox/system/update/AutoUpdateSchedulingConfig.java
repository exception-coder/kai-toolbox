package com.exceptioncoder.toolbox.system.update;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/** Git fetch/build 不占用其它工具共用的 Spring scheduler。 */
@Configuration
@EnableScheduling
public class AutoUpdateSchedulingConfig {

    /** 其它未显式指定 scheduler 的工具继续走独立全局池，不会被 Maven/npm 构建饿死。 */
    @Bean(name = "taskScheduler")
    @Primary
    public ThreadPoolTaskScheduler taskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(4);
        scheduler.setThreadNamePrefix("scheduled-");
        scheduler.setRemoveOnCancelPolicy(true);
        scheduler.setWaitForTasksToCompleteOnShutdown(false);
        return scheduler;
    }

    @Bean(name = "autoUpdateTaskScheduler")
    public ThreadPoolTaskScheduler autoUpdateTaskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("auto-update-");
        scheduler.setRemoveOnCancelPolicy(true);
        scheduler.setWaitForTasksToCompleteOnShutdown(false);
        return scheduler;
    }
}
