package com.exceptioncoder.toolbox.foreconsult.suggestion;

/** 面向咨询用户的建议；提交人只在存储中用于幂等，不向公共清单暴露账号。 */
public record ConsultSuggestion(String id, String original, String title, String problem,
                                String expected, String acceptance, long createdAt) {
    public record Draft(String title, String problem, String expected, String acceptance) { }
    public record Submit(String requestId, String original, Draft draft) { }
    public record Page(java.util.List<ConsultSuggestion> items, long total) { }
}
