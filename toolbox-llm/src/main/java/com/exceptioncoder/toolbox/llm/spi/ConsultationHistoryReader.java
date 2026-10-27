package com.exceptioncoder.toolbox.llm.spi;

/** Full platform-owned history is paged under the existing consultation resource authorization. */
public interface ConsultationHistoryReader {
    Page read(String runtimeSessionId, int offset, int maxChars);

    record Page(int offset, int nextOffset, boolean complete, String text, String gap) { }
}
