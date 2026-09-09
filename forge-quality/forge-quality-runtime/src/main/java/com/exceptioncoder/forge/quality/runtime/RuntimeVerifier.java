package com.exceptioncoder.forge.quality.runtime;

/** Adapter SPI for one kind of real environment verification. */
public interface RuntimeVerifier {
    /** Returns the stable verifier identifier. */
    String id();

    /** Returns whether this verifier owns the scenario type. */
    boolean supports(String scenarioType);

    /** Executes one scenario and returns a sanitized result. */
    RuntimeVerificationResult verify(RuntimeScenario scenario);
}
