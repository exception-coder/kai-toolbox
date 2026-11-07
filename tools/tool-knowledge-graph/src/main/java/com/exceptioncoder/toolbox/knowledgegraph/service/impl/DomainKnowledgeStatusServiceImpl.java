package com.exceptioncoder.toolbox.knowledgegraph.service.impl;

import com.exceptioncoder.toolbox.knowledgegraph.model.DomainKnowledgeStatus;
import com.exceptioncoder.toolbox.knowledgegraph.model.GraphRepo;
import com.exceptioncoder.toolbox.knowledgegraph.service.DomainKnowledgeStatusService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** 保留旧客户端路由的明确退役响应。 */
@Service
public class DomainKnowledgeStatusServiceImpl implements DomainKnowledgeStatusService {

    @Override
    public DomainKnowledgeStatus detectStatus(String projectPath, GraphRepo repo) {
        throw new ResponseStatusException(HttpStatus.GONE,
                "公共知识图谱已退役，请读取项目 docs/INDEX.md、docs/domain 与现有规格，使用初始化 skill 整理缺口。");
    }
}
