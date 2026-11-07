package com.exceptioncoder.toolbox.knowledgegraph.service;

import com.exceptioncoder.toolbox.knowledgegraph.model.DomainKnowledgeStatus;
import com.exceptioncoder.toolbox.knowledgegraph.model.GraphRepo;

/** 旧公共知识图谱状态接口，当前统一返回退役响应。 */
public interface DomainKnowledgeStatusService {

    DomainKnowledgeStatus detectStatus(String projectRootPath, GraphRepo repo);
}
