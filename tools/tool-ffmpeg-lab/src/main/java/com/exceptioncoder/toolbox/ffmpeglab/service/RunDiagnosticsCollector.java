package com.exceptioncoder.toolbox.ffmpeglab.service;

import com.exceptioncoder.toolbox.ffmpeglab.domain.RunResult;
import org.springframework.stereotype.Component;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.List;

/**
 * 最近 N 条运行诊断的内存环形缓冲（仿 treesize 的 PlaybackStatsCollector）。纯内存、线程安全、无持久化。
 */
@Component
public class RunDiagnosticsCollector {

    /** 保留最近条数，够覆盖一次「5 种模式各跑一遍」的对照，再多翻历史意义不大。 */
    private static final int MAX = 50;

    private final Deque<RunResult> ring = new ArrayDeque<>();

    public synchronized void record(RunResult r) {
        ring.addFirst(r);
        while (ring.size() > MAX) {
            ring.pollLast();
        }
    }

    /** 倒序快照（最新在前）。 */
    public synchronized List<RunResult> recent() {
        return Collections.unmodifiableList(new ArrayList<>(ring));
    }
}
