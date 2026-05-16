package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.treesize.domain.SegmentStat;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

/**
 * Bounded in-memory ring of recent HLS segment samples for the {@code /playback-stats} endpoint.
 *
 * <p>Single-host, low-QPS context — a plain {@code synchronized} block on an {@link ArrayDeque}
 * is correct and cheap. Newest-first snapshot order matches what the UI overlay wants to render.
 *
 * <p>Recording is best-effort: any failure here is swallowed so the observability path can never
 * impact the playback path it observes.
 */
@Component
public class PlaybackStatsCollector {

    private static final Logger log = LoggerFactory.getLogger(PlaybackStatsCollector.class);
    private static final int CAPACITY = 50;

    private final Deque<SegmentStat> buffer = new ArrayDeque<>(CAPACITY);

    public void record(SegmentStat stat) {
        try {
            synchronized (buffer) {
                if (buffer.size() >= CAPACITY) {
                    buffer.removeFirst();
                }
                buffer.addLast(stat);
            }
        } catch (Exception e) {
            log.warn("playback stats record failed (swallowed): {}", e.toString());
        }
    }

    /** Newest-first snapshot. Caller owns the returned list. */
    public List<SegmentStat> recent() {
        synchronized (buffer) {
            List<SegmentStat> snapshot = new ArrayList<>(buffer.size());
            var it = buffer.descendingIterator();
            while (it.hasNext()) snapshot.add(it.next());
            return snapshot;
        }
    }
}
