package com.exceptioncoder.toolbox.common.resource;

import java.util.List;

/** 项目系统身份的公开目录，不在消费方创建平行系统记录。 */
public interface ProjectSystemDirectory {
    List<SystemIdentity> systems();

    record SystemIdentity(String id, String name, String sourcePath) {
        public SystemIdentity(String id, String name) { this(id, name, null); }
    }
}
