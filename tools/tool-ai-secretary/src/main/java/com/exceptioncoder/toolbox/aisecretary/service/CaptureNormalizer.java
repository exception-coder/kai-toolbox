package com.exceptioncoder.toolbox.aisecretary.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 记录态的「确定性护栏」：把能用代码稳定算/校验的活从 LLM 手里收回来。
 *
 * <ul>
 *   <li>{@link #nowContext} —— 给 LLM 注入带时区+星期的当前时间，替代裸 UTC Instant；</li>
 *   <li>{@link #normalizeDueTime} —— 校验并归一化 LLM 给的时间串，解析不了就丢弃（由调用方标待复核）；</li>
 *   <li>{@link #extractAmount} —— 从原文正则抽金额，作为开销漏抽时的兜底。</li>
 * </ul>
 * 体现「LLM 提议，代码裁决」：LLM 只做模糊理解，确定性计算/校验落在这里，便于单测。
 */
public final class CaptureNormalizer {

    private CaptureNormalizer() {
    }

    private static final String[] WEEKDAYS = {"周一", "周二", "周三", "周四", "周五", "周六", "周日"};
    private static final DateTimeFormatter ISO_OFFSET =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssxxx");

    /** 形如 "2026-06-10T15:30:00+08:00（Asia/Shanghai，周三）"，让模型有明确的时区与"今天"语境。 */
    public static String nowContext(ZonedDateTime now) {
        String weekday = WEEKDAYS[now.getDayOfWeek().getValue() - 1];
        return now.format(ISO_OFFSET) + "（" + now.getZone() + "，" + weekday + "）";
    }

    /**
     * 校验并归一化 LLM 输出的时间串为带偏移的 ISO-8601；无偏移的按给定时区补齐；
     * 完全解析不了返回 null（调用方据此丢弃 + 标待复核），绝不把脏数据落库。
     */
    public static String normalizeDueTime(String raw, ZoneId zone) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String t = raw.trim();
        try {
            return OffsetDateTime.parse(t).toString();
        } catch (Exception ignored) {
            // 继续尝试其它格式
        }
        try {
            return ZonedDateTime.parse(t).toOffsetDateTime().toString();
        } catch (Exception ignored) {
            // 继续
        }
        try {
            return LocalDateTime.parse(t).atZone(zone).toOffsetDateTime().toString();
        } catch (Exception ignored) {
            // 继续
        }
        try {
            return LocalDate.parse(t).atStartOfDay(zone).toOffsetDateTime().toString();
        } catch (Exception ignored) {
            return null;
        }
    }

    // 必须带货币线索（块/元/¥…）才算金额，避免把「3点」「38路」这类数字误当钱
    private static final Pattern AMOUNT_SUFFIX =
            Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*(?:块钱|块|元|圆|塊|RMB|rmb)");
    private static final Pattern AMOUNT_PREFIX =
            Pattern.compile("[¥￥$]\\s*(\\d+(?:\\.\\d+)?)");

    /** 从原文抽金额；抽不到返回 null。 */
    public static Double extractAmount(String raw) {
        if (raw == null) {
            return null;
        }
        Matcher m = AMOUNT_SUFFIX.matcher(raw);
        if (m.find()) {
            return Double.valueOf(m.group(1));
        }
        m = AMOUNT_PREFIX.matcher(raw);
        if (m.find()) {
            return Double.valueOf(m.group(1));
        }
        return null;
    }
}
