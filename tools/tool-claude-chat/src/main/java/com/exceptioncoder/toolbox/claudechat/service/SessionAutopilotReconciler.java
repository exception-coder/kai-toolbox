package com.exceptioncoder.toolbox.claudechat.service;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** 在服务重启或事件丢失后恢复活动自动监督运行。 */
@Component
public class SessionAutopilotReconciler {

    private final SessionAutopilotService service;
    private volatile boolean ready;

    public SessionAutopilotReconciler(SessionAutopilotService service) {
        this.service = service;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        ready = true;
        service.reconcileActiveRuns();
    }

    @Scheduled(fixedDelayString = "${toolbox.claude-chat.autopilot.reconcile-ms:15000}")
    public void reconcile() {
        if (ready) service.reconcileActiveRuns();
    }
}
