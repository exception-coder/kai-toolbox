package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * 应用启动时收敛无法跨 JVM 延续的执行计划任务，避免页面永久显示运行中。
 */
@Slf4j
@Component
public class PrdDevDocWorkRecovery implements ApplicationRunner {

    private final PrdSessionRepository repository;

    public PrdDevDocWorkRecovery(PrdSessionRepository repository) {
        this.repository = repository;
    }

    @Override
    public void run(ApplicationArguments args) {
        int recovered = repository.failInterruptedDevDocWork(
                "服务已重启，原后台执行无法继续；已保留生成快照，可重新生成执行计划",
                System.currentTimeMillis());
        if (recovered > 0) {
            log.warn("[prd-clarify] 已收敛 {} 个进程重启前遗留的执行计划任务", recovered);
        }
    }
}
