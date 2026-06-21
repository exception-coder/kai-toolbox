package com.exceptioncoder.toolbox.common.log;

import com.exceptioncoder.toolbox.common.log.RingBufferLogAppender.Entry;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * 从 {@link RingBufferLogAppender} 的内存缓冲提取最近日志，渲染成可直接复制的纯文本。
 *
 * <p>两种取法：
 * <ul>
 *   <li>{@code error}（默认）：定位最近的 WARN/ERROR，连同前后若干行上下文一并给出——噪音少、最贴问题；
 *       缓冲里没有 WARN/ERROR 时回退最近若干行，保证有东西可看。</li>
 *   <li>{@code all}：最近 N 条全量。</li>
 * </ul>
 */
@Service
public class RecentLogsService {

    private static final DateTimeFormatter TS =
            DateTimeFormatter.ofPattern("HH:mm:ss.SSS").withZone(ZoneId.systemDefault());

    /** error 模式无命中时的回退行数。 */
    private static final int FALLBACK_TAIL = 80;

    public String recent(String mode, int limit, int context) {
        List<Entry> all = RingBufferLogAppender.snapshot();
        if (all.isEmpty()) {
            return "（暂无日志缓存：后端可能刚启动，或 RingBufferLogAppender 未挂载。）";
        }
        boolean errorMode = !"all".equalsIgnoreCase(mode);
        List<String> rendered = errorMode
                ? renderErrorWithContext(all, limit, context)
                : renderTail(all, limit);
        if (rendered.isEmpty()) {
            return "（最近 " + all.size() + " 条日志里没有 WARN/ERROR；切到「全部」可看全量。）";
        }
        return String.join(System.lineSeparator(), rendered);
    }

    /** 最近 limit 条全量。 */
    private List<String> renderTail(List<Entry> all, int limit) {
        int from = Math.max(0, all.size() - limit);
        List<String> out = new ArrayList<>();
        for (int i = from; i < all.size(); i++) {
            out.add(format(all.get(i)));
        }
        return out;
    }

    /**
     * 错误优先 + 上下文：标记每个 WARN/ERROR 的 [i-context, i+context] 窗口并合并，
     * 仅保留最近 limit 条命中行；窗口之间不连续处插入分隔标记，便于看出跳段。
     * 无 WARN/ERROR 时回退最近 FALLBACK_TAIL 条。
     */
    private List<String> renderErrorWithContext(List<Entry> all, int limit, int context) {
        int n = all.size();
        boolean[] include = new boolean[n];
        boolean anyHit = false;
        for (int i = 0; i < n; i++) {
            if (isAlert(all.get(i).level())) {
                anyHit = true;
                int lo = Math.max(0, i - context);
                int hi = Math.min(n - 1, i + context);
                for (int j = lo; j <= hi; j++) {
                    include[j] = true;
                }
            }
        }
        if (!anyHit) {
            return renderTail(all, FALLBACK_TAIL);
        }

        // 收集被选中的下标（最旧在前），超出 limit 则只留最近的部分
        List<Integer> picked = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            if (include[i]) {
                picked.add(i);
            }
        }
        if (picked.size() > limit) {
            picked = picked.subList(picked.size() - limit, picked.size());
        }

        List<String> out = new ArrayList<>();
        int prev = -1;
        for (int idx : picked) {
            if (prev != -1 && idx > prev + 1) {
                out.add("   …（略过 " + (idx - prev - 1) + " 行）…");
            }
            out.add(format(all.get(idx)));
            prev = idx;
        }
        return out;
    }

    private boolean isAlert(String level) {
        return "ERROR".equals(level) || "WARN".equals(level);
    }

    /** 与控制台 pattern 对齐：HH:mm:ss.SSS LEVEL [thread] logger - message。 */
    private String format(Entry e) {
        return String.format("%s %-5s [%s] %s - %s",
                TS.format(Instant.ofEpochMilli(e.ts())),
                e.level(), e.thread(), e.logger(), e.message());
    }
}
