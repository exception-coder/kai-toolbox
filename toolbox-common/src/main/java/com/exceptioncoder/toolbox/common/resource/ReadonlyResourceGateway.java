package com.exceptioncoder.toolbox.common.resource;

import java.util.List;

/** 只读数据库资源公共端口；配置和凭据由提供方持有。 */
public interface ReadonlyResourceGateway {
    List<Entry> catalog();
    List<Entry> discover(String sourcePath, List<String> bindingIds);
    Object query(String sourcePath, List<String> bindingIds, String bindingId, String sql);

    record Entry(String bindingId, String systemId, String systemName, String name,
                 String environment, String purpose, String state, String configurationUrl) { }
}
