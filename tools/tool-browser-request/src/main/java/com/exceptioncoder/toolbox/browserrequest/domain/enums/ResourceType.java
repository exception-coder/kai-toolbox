package com.exceptioncoder.toolbox.browserrequest.domain.enums;

/** HTTP 调用的资源类型（来自 Playwright Request.resourceType()）。 */
public enum ResourceType {
    /** 传统 XMLHttpRequest（业务接口主力）。 */
    XHR,
    /** fetch 调用（现代业务接口）。 */
    FETCH,
    /** 顶层 / iframe 文档（导航跳转、HTML 加载）。 */
    DOCUMENT,
    /** JavaScript 资源——默认不录，captureScript=true 时才纳入。 */
    SCRIPT;

    /**
     * Playwright `resourceType()` 返回的小写串映射到本枚举。未知类型返回 null（跳过）。
     */
    public static ResourceType fromPlaywright(String type) {
        if (type == null) return null;
        return switch (type) {
            case "xhr" -> XHR;
            case "fetch" -> FETCH;
            case "document" -> DOCUMENT;
            case "script" -> SCRIPT;
            default -> null;
        };
    }
}
