package com.exceptioncoder.toolbox.browserrequest.preview;

import java.util.function.Consumer;
import java.util.function.BooleanSupplier;

/** 预览用例使用的浏览器端口，生产实现复用受管 Playwright worker。 */
interface PreviewBrowser {
    void open(String id, PreviewPlan plan, Consumer<String> stage, BooleanSupplier cancelled);
    void resume(String id, PreviewPlan plan, Consumer<String> stage, BooleanSupplier cancelled);
    byte[] screenshot(String id);
    void input(String id, PreviewInput input);
    void close(String id);
}
