package com.exceptioncoder.toolbox.knowledgegraph.service;

import com.exceptioncoder.toolbox.knowledgegraph.model.DomainKnowledgeStatus;
import com.exceptioncoder.toolbox.knowledgegraph.model.GraphRepo;

/** 检测项目在 domain-knowledge / cross-topology 集中知识库里的登记状态。 */
public interface DomainKnowledgeStatusService {

    DomainKnowledgeStatus detectStatus(String projectRootPath, GraphRepo repo);
}
