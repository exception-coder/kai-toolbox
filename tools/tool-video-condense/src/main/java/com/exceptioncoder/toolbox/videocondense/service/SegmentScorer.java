package com.exceptioncoder.toolbox.videocondense.service;

import com.exceptioncoder.toolbox.videocondense.config.VideoCondenseProperties;
import com.exceptioncoder.toolbox.videocondense.domain.ActivitySample;
import com.exceptioncoder.toolbox.videocondense.domain.Segment;
import com.exceptioncoder.toolbox.videocondense.domain.SegmentType;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * 把逐帧活动度 + freezedetect 区间聚合成「带类型的连续片段」。纯计算、无副作用，便于单测。
 * speed 不在此设置（留给 {@link SpeedCurveGenerator}），输出 Segment 的 speed 恒为 0。
 */
@Service
public class SegmentScorer {

    /**
     * @param samples  逐帧活动度（按 time 升序）
     * @param freezes  freezedetect 静止区间，每个 {@code [start, end]}（秒）
     * @param duration 原片时长（秒）
     */
    public List<Segment> score(List<ActivitySample> samples, List<double[]> freezes,
                               double duration, VideoCondenseProperties p) {
        double dur = duration > 0 ? duration
                : (samples.isEmpty() ? 0 : samples.get(samples.size() - 1).time());
        if (dur <= 0) {
            return List.of();
        }
        double window = Math.max(0.1, p.getWindowSeconds());
        int nWindows = (int) Math.ceil(dur / window);
        double[] sum = new double[nWindows];
        int[] cnt = new int[nWindows];
        for (ActivitySample s : samples) {
            int idx = (int) Math.floor(s.time() / window);
            if (idx < 0) idx = 0;
            if (idx >= nWindows) idx = nWindows - 1;
            sum[idx] += s.score();
            cnt[idx]++;
        }

        List<Segment> windows = new ArrayList<>();
        for (int w = 0; w < nWindows; w++) {
            double wStart = w * window;
            double wEnd = Math.min(dur, (w + 1) * window);
            if (wEnd <= wStart) continue;
            double avg = cnt[w] > 0 ? sum[w] / cnt[w] : 0.0;
            boolean freeze = overlapsFreeze(wStart, wEnd, freezes);
            windows.add(new Segment(wStart, wEnd, avg, classify(avg, freeze, p), 0.0));
        }

        List<Segment> merged = enforceMin(mergeAdjacent(windows), p.getMinSegmentSeconds());
        return markKeyMoments(merged);
    }

    private SegmentType classify(double avg, boolean freeze, VideoCondenseProperties p) {
        if (freeze) return SegmentType.FREEZE;
        if (avg >= p.getNormalThreshold()) return SegmentType.NORMAL;
        if (avg >= p.getMidThreshold()) return SegmentType.STREAMING;
        return SegmentType.WAITING;
    }

    private static boolean overlapsFreeze(double start, double end, List<double[]> freezes) {
        for (double[] f : freezes) {
            if (f.length >= 2 && f[0] < end && f[1] > start) return true;
        }
        return false;
    }

    /** 合并相邻同类型窗口，score 按时长加权平均。 */
    private List<Segment> mergeAdjacent(List<Segment> segs) {
        List<Segment> out = new ArrayList<>();
        for (Segment s : segs) {
            if (!out.isEmpty() && out.get(out.size() - 1).type() == s.type()) {
                out.set(out.size() - 1, join(out.get(out.size() - 1), s, out.get(out.size() - 1).type()));
            } else {
                out.add(s);
            }
        }
        return out;
    }

    /** 把短于 min 的段并入前一段（首段则并入后一段）。 */
    private List<Segment> enforceMin(List<Segment> segs, double min) {
        if (segs.size() <= 1) return segs;
        List<Segment> out = new ArrayList<>();
        for (Segment s : segs) {
            if (!out.isEmpty() && (s.end() - s.start()) < min) {
                Segment last = out.remove(out.size() - 1);
                out.add(join(last, s, last.type()));
            } else {
                out.add(s);
            }
        }
        if (out.size() > 1 && (out.get(0).end() - out.get(0).start()) < min) {
            Segment first = out.remove(0);
            Segment next = out.remove(0);
            out.add(0, join(first, next, next.type()));
        }
        return out;
    }

    /** 活动度由低（WAITING/FREEZE）突升到 NORMAL 的边界标 KEY_MOMENT，提示高光。 */
    private List<Segment> markKeyMoments(List<Segment> segs) {
        List<Segment> out = new ArrayList<>(segs);
        for (int i = 1; i < out.size(); i++) {
            Segment cur = out.get(i);
            SegmentType prev = out.get(i - 1).type();
            if (cur.type() == SegmentType.NORMAL
                    && (prev == SegmentType.WAITING || prev == SegmentType.FREEZE)) {
                out.set(i, new Segment(cur.start(), cur.end(), cur.score(), SegmentType.KEY_MOMENT, cur.speed()));
            }
        }
        return out;
    }

    private static Segment join(Segment a, Segment b, SegmentType type) {
        double da = a.end() - a.start();
        double db = b.end() - b.start();
        double total = da + db;
        double score = total > 0 ? (a.score() * da + b.score() * db) / total : a.score();
        return new Segment(a.start(), b.end(), score, type, 0.0);
    }
}
