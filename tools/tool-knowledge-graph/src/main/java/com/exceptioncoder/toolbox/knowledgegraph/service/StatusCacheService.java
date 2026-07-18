package com.exceptioncoder.toolbox.knowledgegraph.service;

import com.exceptioncoder.toolbox.knowledgegraph.model.ProjectStatusSnapshot;

import java.util.List;
import java.util.Map;

/**
 * 项目工作台跨项目状态筛选的支撑服务：编排 {@link GraphifyProjectStatusService}/
 * {@link DomainKnowledgeStatusService} 做批量检测，结果落盘缓存供筛选栏读取。
 */
public interface StatusCacheService {

    /** 直接读缓存文件，不触发任何检测；文件不存在时返回空 Map。 */
    Map<String, ProjectStatusSnapshot> getCached();

    /** 并发检测给定的项目路径列表，写回缓存文件，返回本次范围对应的最新结果。 */
    Map<String, ProjectStatusSnapshot> refresh(List<String> paths);
}
