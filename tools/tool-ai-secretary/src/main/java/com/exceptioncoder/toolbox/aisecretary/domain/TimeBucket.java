package com.exceptioncoder.toolbox.aisecretary.domain;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;

/**
 * 受控时间桶（封闭枚举）。
 *
 * <p>确定性优先的正确姿势：<b>枚举"输出"而非穷举"输入"</b>。
 * LLM 把任意中文时间说法（最近 / 前阵子 / 这几天 / 上周 / 这个月…）归到其中一个桶——这是它的强项，
 * 新说法零代码维护；代码只负责把有限的桶确定性地算成 [起, 止) 时间戳——这是代码的强项，可测、封顶。
 *
 * <p>作为 {@code @Tool} 方法参数时，LangChain4j 会把可选值写进工具 schema，模型只能从这些值里挑一个。
 */
public enum TimeBucket {
    TODAY,
    YESTERDAY,
    THIS_WEEK,
    LAST_WEEK,
    THIS_MONTH,
    LAST_MONTH,
    LAST_7_DAYS,
    LAST_30_DAYS,
    THIS_YEAR,
    ALL;

    public record Range(long fromMs, long toMs) {
    }

    /** 算出该桶对应的 [起, 止) 时间戳；{@link #ALL} 返回 null（即不加时间过滤）。 */
    public Range toRange(ZoneId zone) {
        LocalDate today = LocalDate.now(zone);
        LocalDate monday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        return switch (this) {
            case TODAY -> range(today, today.plusDays(1), zone);
            case YESTERDAY -> range(today.minusDays(1), today, zone);
            case THIS_WEEK -> range(monday, monday.plusDays(7), zone);
            case LAST_WEEK -> range(monday.minusDays(7), monday, zone);
            case THIS_MONTH -> {
                LocalDate first = today.withDayOfMonth(1);
                yield range(first, first.plusMonths(1), zone);
            }
            case LAST_MONTH -> {
                LocalDate first = today.withDayOfMonth(1).minusMonths(1);
                yield range(first, first.plusMonths(1), zone);
            }
            case LAST_7_DAYS -> range(today.minusDays(6), today.plusDays(1), zone);
            case LAST_30_DAYS -> range(today.minusDays(29), today.plusDays(1), zone);
            case THIS_YEAR -> {
                LocalDate first = today.withDayOfYear(1);
                yield range(first, first.plusYears(1), zone);
            }
            case ALL -> null;
        };
    }

    private static Range range(LocalDate from, LocalDate toExclusive, ZoneId zone) {
        return new Range(
                from.atStartOfDay(zone).toInstant().toEpochMilli(),
                toExclusive.atStartOfDay(zone).toInstant().toEpochMilli());
    }
}
