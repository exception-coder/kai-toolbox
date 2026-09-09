package com.exceptioncoder.forge.quality.application;

/** A normalized issue from either verification phase. */
public record VerificationIssue(String phase, String ruleId, String scenarioId, String message, String evidence) {
}
