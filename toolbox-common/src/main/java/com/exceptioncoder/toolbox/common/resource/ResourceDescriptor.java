package com.exceptioncoder.toolbox.common.resource;

import java.util.List;

/** 可发现的资源元信息；不得包含密码、Cookie 或完整连接参数。 */
public record ResourceDescriptor(String id, String name, String kind, String environment,
                                 String endpoint, String account, boolean credentialConfigured,
                                 List<String> capabilities, String configurationUrl) {
}
