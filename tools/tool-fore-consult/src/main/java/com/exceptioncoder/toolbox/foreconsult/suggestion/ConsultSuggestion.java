package com.exceptioncoder.toolbox.foreconsult.suggestion;

/** 面向咨询用户的建议；提交人只在存储中用于幂等，不向公共清单暴露账号。 */
public record ConsultSuggestion(String id, String original, String title, String problem,
                                String expected, String acceptance, long createdAt,
                                String state, String reason, String requirementId, String commitHash) {
    public ConsultSuggestion(String id, String original, String title, String problem, String expected, String acceptance, long createdAt) {
        this(id, original, title, problem, expected, acceptance, createdAt, "PENDING_REVIEW", "", null, null);
    }
    public record Draft(String title, String problem, String expected, String acceptance) { }
    @com.fasterxml.jackson.annotation.JsonProperty("implementationStatus")
    public String implementationStatus() {
        return switch (state) {
            case "QUEUED", "MANUAL_QUEUED", "FAILED" -> "PENDING_EXECUTION";
            case "RUNNING" -> "IN_DEV";
            case "COMMITTED" -> "READY_FOR_RELEASE";
            default -> null;
        };
    }
    public record Submit(String requestId, String original, Draft draft) { }
    public record Page(java.util.List<ConsultSuggestion> items, long total) { }
}
