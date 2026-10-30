package com.exceptioncoder.toolbox.llm.spi;

/** Public consultation use cases; authorization comes from the host's verified user context. */
public interface ConsultClientApplication {
    Prepared prepare(
        String requestId,
        String consultationId,
        String question,
        java.util.List<String> attachmentIds
    );
    Bound require(String consultationId, boolean writable);

    record Bound(
        String consultationId,
        String runtimeId,
        String title,
        String archiveStatus
    ) {}

    record Prepared(Bound session, String prompt) {}
}
