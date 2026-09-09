package com.exceptioncoder.toolbox.projects.registry.domain;

/** 持久化系统身份；代码结构与运行证据由版本画像拥有。 */
public record RegistryProject(
        /** 稳定系统标识。 */ String id,
        /** 用户维护的基础信息。 */ Metadata metadata,
        /** 当前就绪状态。 */ String state,
        /** 最新已发布版本，零表示尚未初始化。 */ Integer profileVersion,
        /** 注册时间。 */ Long createdAt,
        /** 最近变更时间。 */ Long updatedAt
) {
    /** 注册信息不包含派生模块、类、表或接口。 */
    public record Metadata(
            /** 系统名称。 */ String name,
            /** 本机规范化目录。 */ String localPath,
            /** git、svn 或 local。 */ String repoType,
            /** 不含凭据的仓库地址。 */ String repoUrl,
            /** 默认分支。 */ String defaultBranch,
            /** 开发访问地址。 */ String devUrl,
            /** 测试访问地址。 */ String testUrl,
            /** 负责团队。 */ String owner
    ) { }
}
