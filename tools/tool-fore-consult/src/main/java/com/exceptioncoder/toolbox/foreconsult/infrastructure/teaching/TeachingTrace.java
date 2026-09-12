package com.exceptioncoder.toolbox.foreconsult.infrastructure.teaching;

import com.exceptioncoder.toolbox.foreconsult.domain.teaching.OrderDraft;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingRun;
import java.util.ArrayList;
import java.util.List;

/** 单次执行的线程安全观测缓冲区，不保存密钥或内部思维链。 */
final class TeachingTrace {
    private final long started = System.nanoTime();
    private final List<TeachingRun.Step> steps = new ArrayList<>();
    private OrderDraft draft;
    private Integer tokens;

    synchronized void add(String type, String detail) {
        if (steps.size() < 100) {
            steps.add(new TeachingRun.Step(elapsed(), type, detail));
        }
    }

    synchronized void draft(OrderDraft value) {
        draft = value;
    }

    synchronized OrderDraft draft() {
        return draft;
    }

    synchronized void usage(int value) {
        tokens = (tokens == null ? 0 : tokens) + value;
    }

    synchronized Integer tokens() {
        return tokens;
    }

    synchronized List<TeachingRun.Step> steps() {
        return List.copyOf(steps);
    }

    long elapsed() {
        return (System.nanoTime() - started) / 1_000_000;
    }
}
