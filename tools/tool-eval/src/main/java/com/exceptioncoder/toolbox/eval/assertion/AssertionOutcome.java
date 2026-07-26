package com.exceptioncoder.toolbox.eval.assertion;

/**
 * 单条断言的判定明细。失败时 expected/actual 都要落库——只记一个 false 等于没记，
 * 回归报告的价值全在「哪个字段、从什么变成了什么」。
 */
public record AssertionOutcome(
        String type,
        String path,
        boolean passed,
        double weight,
        String expected,
        String actual,
        String message
) {
}
