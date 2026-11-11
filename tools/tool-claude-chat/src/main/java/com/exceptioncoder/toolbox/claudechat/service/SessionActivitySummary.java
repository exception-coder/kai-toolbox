package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClaudeChatActivityView;

import java.util.Collection;

/**
 * 进程内活动摘要：汇总运行中轮次、不确定会话、未决请求、后台任务与一次性调用，
 * 供自动更新与重启安全门判断。纯函数，从 ClaudeChatService 拆出。
 */
final class SessionActivitySummary {

    private SessionActivitySummary() { }

    static ClaudeChatActivityView summarizeActivity(Collection<ActivitySample> samples,
                                                      int oneShotCount, long observedAt) {
        int runningTurnCount = 0;
        int uncertainSessionCount = 0;
        int pendingRequestCount = 0;
        int backgroundTaskCount = 0;
        int activeSessionCount = 0;
        for (ActivitySample sample : samples) {
            if (sample.runningTurn()) runningTurnCount++;
            if (sample.uncertain()) uncertainSessionCount++;
            if (sample.pendingRequest()) pendingRequestCount++;
            backgroundTaskCount += sample.backgroundTaskCount();
            if (sample.runningTurn() || sample.uncertain()
                    || sample.pendingRequest() || sample.backgroundTaskCount() > 0) {
                activeSessionCount++;
            }
        }
        int activeOneShotCount = Math.max(0, oneShotCount);
        boolean active = activeSessionCount > 0 || activeOneShotCount > 0;
        return new ClaudeChatActivityView(active, !active, activeSessionCount, runningTurnCount,
                uncertainSessionCount,
                pendingRequestCount, backgroundTaskCount, activeOneShotCount, observedAt);
    }

    record ActivitySample(boolean runningTurn, boolean uncertain,
                          boolean pendingRequest, int backgroundTaskCount) {
        ActivitySample {
            backgroundTaskCount = Math.max(0, backgroundTaskCount);
        }
    }
}
