package com.exceptioncoder.forge.quality.core;

/** A structured checker result suitable for agents and CI. */
public record Finding(
        String ruleId,
        Severity severity,
        String message,
        String file,
        Integer line,
        String evidence
) {
    /** Creates a validated finding. */
    public Finding {
        if (ruleId == null || ruleId.isBlank()) {
            throw new IllegalArgumentException("ruleId must not be blank");
        }
        if (severity == null) {
            throw new IllegalArgumentException("severity must not be null");
        }
        if (message == null || message.isBlank()) {
            throw new IllegalArgumentException("message must not be blank");
        }
        file = file == null ? "" : file;
        evidence = evidence == null ? "" : evidence;
    }
}
