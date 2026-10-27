package com.exceptioncoder.toolbox.llm.spi;

/** A controlled authentication/workspace/catalog probe; never executes a business prompt. */
public interface AgentAccountValidator {
    Result validate(String codexHome, String model);

    record Result(boolean available, String code, String message, long checkedAt) { }
}
