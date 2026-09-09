package com.exceptioncoder.toolbox.projects.registry.domain;

/** 需求池任务与系统画像的绑定快照；任务生命周期仍由需求池管理。 */
public record SystemTaskBinding(
        /** 需求池任务标识。 */ String id,
        /** 所属系统。 */ String projectId,
        /** 创建时画像版本。 */ Integer profileVersion,
        /** 标题快照。 */ String title,
        /** 用户原始描述。 */ String description,
        /** 可选业务域。 */ String domainId,
        /** 可选补充上下文。 */ String context,
        /** 创建时间。 */ Long createdAt
) { }
