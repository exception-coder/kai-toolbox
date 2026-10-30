package com.exceptioncoder.toolbox.llm.spi;

import java.util.List;

/** Chat-owned operations used by the consultation application; never accepts client paths or AI credentials. */
public interface ConsultClientRuntime {
    void create(Definition definition);

    record Definition(
        String id,
        long owner,
        String title,
        String cwd,
        String model,
        String codexHome,
        List<String> systems
    ) {}
}
