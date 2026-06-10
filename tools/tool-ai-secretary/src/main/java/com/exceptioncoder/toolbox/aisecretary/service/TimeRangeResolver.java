package com.exceptioncoder.toolbox.aisecretary.service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;

/**
 * 把「今天 / 本周 / 上周 / 本月 / 上月 / 今年…」等中文时间范围**确定性地**换算成 [起, 止) 时间戳。
 *
 * <p>确定性优先：回忆态里时间范围由代码算,不让 LLM 写带日期的 SQL。LLM 只把范围词当字符串传进来。
 * 识别不了返回 null（调用方据此不加时间过滤）。
 */
public final class TimeRangeResolver {

    private TimeRangeResolver() {
    }

    public record Range(long fromMs, long toMs) {
    }

    public static Range resolve(String raw, ZoneId zone) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String s = raw.trim();
        LocalDate today = LocalDate.now(zone);
        LocalDate monday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));

        if (s.contains("今天") || s.contains("今日")) {
            return day(today, today.plusDays(1), zone);
        }
        if (s.contains("昨天") || s.contains("昨日")) {
            return day(today.minusDays(1), today, zone);
        }
        if (s.contains("上周") || s.contains("上星期") || s.contains("上个星期")) {
            return day(monday.minusDays(7), monday, zone);
        }
        if (s.contains("本周") || s.contains("这周") || s.contains("这个星期")) {
            return day(monday, monday.plusDays(7), zone);
        }
        if (s.contains("上月") || s.contains("上个月")) {
            LocalDate first = today.withDayOfMonth(1).minusMonths(1);
            return day(first, first.plusMonths(1), zone);
        }
        if (s.contains("本月") || s.contains("这个月") || s.contains("这月")) {
            LocalDate first = today.withDayOfMonth(1);
            return day(first, first.plusMonths(1), zone);
        }
        if (s.contains("去年")) {
            LocalDate first = today.withDayOfYear(1).minusYears(1);
            return day(first, first.plusYears(1), zone);
        }
        if (s.contains("今年")) {
            LocalDate first = today.withDayOfYear(1);
            return day(first, first.plusYears(1), zone);
        }
        if (s.contains("最近7") || s.contains("近7") || s.contains("过去7")
                || s.contains("最近一周") || s.contains("近一周")) {
            return day(today.minusDays(6), today.plusDays(1), zone);
        }
        if (s.contains("最近30") || s.contains("近30") || s.contains("最近一个月") || s.contains("近一个月")) {
            return day(today.minusDays(29), today.plusDays(1), zone);
        }
        return null;
    }

    private static Range day(LocalDate from, LocalDate toExclusive, ZoneId zone) {
        long f = from.atStartOfDay(zone).toInstant().toEpochMilli();
        long t = toExclusive.atStartOfDay(zone).toInstant().toEpochMilli();
        return new Range(f, t);
    }
}
