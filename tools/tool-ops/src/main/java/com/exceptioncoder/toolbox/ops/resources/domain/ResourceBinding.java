package com.exceptioncoder.toolbox.ops.resources.domain;

/** 仅引用资源，不复制连接或账号密码。 */
public record ResourceBinding(String id, String systemId, String providerId, String resourceId,
                              String purpose, boolean enabled) { }
