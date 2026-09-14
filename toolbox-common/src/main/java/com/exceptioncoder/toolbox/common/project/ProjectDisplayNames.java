package com.exceptioncoder.toolbox.common.project;

import java.util.Map;

/** 存量路径别名迁移适配端口；登记名称仍由项目领域拥有。 */
public interface ProjectDisplayNames {
    Map<String, String> aliases();
}
