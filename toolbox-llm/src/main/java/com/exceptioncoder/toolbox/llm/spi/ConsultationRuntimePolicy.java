package com.exceptioncoder.toolbox.llm.spi;

import java.util.Optional;

/** Consultation owner resolves policy at execution time; the chat engine owns native handles. */
public interface ConsultationRuntimePolicy {
    Optional<Selection> resolve(String runtimeSessionId, Long ownerId);
    /** Saved history is readable independently of archive state and AI login. */
    default Optional<String> savedHistory(String runtimeSessionId, Long ownerId) { return Optional.empty(); }

    record Selection(String consultationId, String codexHome, String model, long version,
                     String businessContext) { }
}
