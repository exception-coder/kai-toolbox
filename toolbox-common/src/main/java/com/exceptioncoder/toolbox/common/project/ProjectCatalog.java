package com.exceptioncoder.toolbox.common.project;

import java.util.List;

/** 项目领域发布的清单契约；消费者只选择投影，不自行发现或合并目录。 */
public interface ProjectCatalog {
    List<Entry> list(boolean includeExcluded);

    record Entry(String id, String systemId, String name, String path, String root,
                 boolean available, boolean excluded, String source) { }
}
