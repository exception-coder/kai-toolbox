package com.exceptioncoder.toolbox.claudechat.service.autopilot;

import com.exceptioncoder.toolbox.claudechat.domain.QueuedChatMessage;
import com.exceptioncoder.toolbox.claudechat.repository.SessionAutopilotRepository;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.time.Instant;

/** 领取续跑消息时核对持久监督身份，只提升服务端登记的上下文。 */
@Service
public class AutopilotQueuedContextService {

    private final SessionAutopilotRepository repository;
    private final OpenSpecAutopilotAdapter openSpec;

    public AutopilotQueuedContextService(SessionAutopilotRepository repository, OpenSpecAutopilotAdapter openSpec) {
        this.repository = repository;
        this.openSpec = openSpec;
    }

    /** 用户队列不含服务端上下文；旧版内部消息从当前权威状态重建，绝不提升其客户端字段。 */
    public String resolve(QueuedChatMessage message) {
        if (!message.id().startsWith("autopilot:")) {
            return null;
        }
        var run = repository.findBySessionId(message.sessionId()).orElseThrow(StaleContinuationException::new);
        if (!run.sessionId().equals(message.sessionId()) || !run.budgetAvailable(Instant.now())) {
            throw new StaleContinuationException();
        }
        var expected = AutopilotTurnHandoff.forRun(run, run.completedTasks(), run.totalTasks(), run.reason());
        if (!expected.id().equals(message.id())) {
            throw new StaleContinuationException();
        }
        if (message.serverContext() != null && !message.serverContext().isBlank()) {
            return message.serverContext();
        }
        var snapshot = openSpec.inspect(Path.of(run.context().projectRoot()), run.context().changeId());
        return AutopilotTurnHandoff.forRun(run, snapshot, run.reason()).instructions();
    }

    /** 过期的控制消息不能恢复到队首重试；当前监督由既有巡检重新派发。 */
    public static class StaleContinuationException extends IllegalStateException {
        public StaleContinuationException() {
            super("自动推进上下文已过期，已丢弃旧控制消息，保留当前监督并等待重新派发");
        }
    }
}
