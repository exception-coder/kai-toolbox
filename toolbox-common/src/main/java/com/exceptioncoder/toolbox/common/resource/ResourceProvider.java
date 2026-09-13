package com.exceptioncoder.toolbox.common.resource;

import java.util.List;

/** 模块公开的资源发现与操作端口；实现仍拥有连接配置和凭据。 */
public interface ResourceProvider {
    String id();
    List<ResourceDescriptor> resources();
    Object execute(String resourceId, ResourceCall call);
}
