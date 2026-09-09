package com.exceptioncoder.toolbox.performance.api;

import com.exceptioncoder.toolbox.performance.application.StartupSnapshot;
import com.exceptioncoder.toolbox.performance.application.StartupTelemetry;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 当前进程启动诊断；宿主将路径纳入管理员权限策略。 */
@RestController
@RequestMapping("/api/performance")
public class StartupPerformanceController {

    private final StartupTelemetry telemetry;

    public StartupPerformanceController(StartupTelemetry telemetry) {
        this.telemetry = telemetry;
    }

    @GetMapping("/startup")
    public StartupSnapshot startup() {
        return telemetry.snapshot();
    }
}
