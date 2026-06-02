package com.exceptioncoder.toolbox.videocondense.service;

import com.exceptioncoder.toolbox.videocondense.config.VideoCondenseProperties;
import com.exceptioncoder.toolbox.videocondense.domain.RenderSegment;
import com.exceptioncoder.toolbox.videocondense.domain.Segment;
import com.exceptioncoder.toolbox.videocondense.domain.SegmentType;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * 速度策略：score/type → 倍速分档；并在相邻段速度差较大且区间连续的边界做 ramp 平滑过渡。
 * 纯计算，无副作用。score→speed 映射是唯一权威源（scorer 不算 speed）。
 */
@Service
public class SpeedCurveGenerator {

    /** 给 scorer 产出的 segments 填上建议倍速（供前端展示曲线）。 */
    public List<Segment> assignSpeeds(List<Segment> segs, VideoCondenseProperties p) {
        List<Segment> out = new ArrayList<>(segs.size());
        for (Segment s : segs) {
            double speed = speedForScore(s.score(), s.type(), p);
            out.add(new Segment(s.start(), s.end(), s.score(), s.type(), speed));
        }
        return out;
    }

    public double speedForScore(double score, SegmentType type, VideoCondenseProperties p) {
        if (type == SegmentType.FREEZE) return p.getSpeedFreeze();
        if (type == SegmentType.KEY_MOMENT) return p.getSpeedNormal();
        if (score >= p.getNormalThreshold()) return p.getSpeedNormal();
        if (score >= p.getMidThreshold()) return p.getSpeedMid();
        if (score >= p.getLowThreshold()) return p.getSpeedLow();
        return p.getSpeedHigh();
    }

    /**
     * 在相邻段速度差超阈值且时间轴连续（无 gap）的边界插入 ramp 过渡：从两侧各切 rampSeconds/2，
     * 填入若干线性插值子段，避免硬切。gap（被剔除的区间）不 ramp。
     */
    public List<RenderSegment> applyRamp(List<RenderSegment> base, VideoCondenseProperties p) {
        int n = base.size();
        if (n < 2 || p.getRampSeconds() <= 0) return base;
        double half = p.getRampSeconds() / 2.0;
        double eps = 1e-6;

        boolean[] rampAt = new boolean[n]; // rampAt[i] = 在 i 与 i+1 之间过渡
        for (int i = 0; i < n - 1; i++) {
            RenderSegment a = base.get(i), b = base.get(i + 1);
            boolean contiguous = Math.abs(b.start() - a.end()) < eps;
            rampAt[i] = contiguous && needRamp(a.speed(), b.speed(), p);
        }
        // 段太短无法两侧让出 ramp 时，关闭其相邻边界
        for (int i = 0; i < n; i++) {
            if (base.get(i).end() - base.get(i).start() < p.getRampSeconds() * 2 + p.getMinSegmentSeconds()) {
                if (i > 0) rampAt[i - 1] = false;
                if (i < n - 1) rampAt[i] = false;
            }
        }

        int steps = 2;
        List<RenderSegment> out = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            RenderSegment cur = base.get(i);
            double carveStart = (i > 0 && rampAt[i - 1]) ? half : 0;
            double carveEnd = rampAt[i] ? half : 0;
            double bodyStart = cur.start() + carveStart;
            double bodyEnd = cur.end() - carveEnd;
            if (bodyEnd > bodyStart) {
                out.add(new RenderSegment(bodyStart, bodyEnd, cur.speed()));
            }
            if (rampAt[i]) {
                RenderSegment next = base.get(i + 1);
                double rStart = cur.end() - half;
                double rEnd = next.start() + half;
                double stepDur = (rEnd - rStart) / steps;
                for (int k = 0; k < steps; k++) {
                    double t = (k + 0.5) / steps;
                    double speed = cur.speed() + (next.speed() - cur.speed()) * t;
                    out.add(new RenderSegment(rStart + k * stepDur, rStart + (k + 1) * stepDur, speed));
                }
            }
        }
        return out;
    }

    private boolean needRamp(double v0, double v1, VideoCondenseProperties p) {
        double lo = Math.min(v0, v1), hi = Math.max(v0, v1);
        if (lo <= 0) return false;
        return hi / lo >= p.getRampSpeedDeltaThreshold();
    }
}
