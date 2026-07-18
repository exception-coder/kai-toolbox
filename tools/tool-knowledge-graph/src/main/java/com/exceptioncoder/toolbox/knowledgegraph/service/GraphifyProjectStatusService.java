package com.exceptioncoder.toolbox.knowledgegraph.service;

import com.exceptioncoder.toolbox.knowledgegraph.model.GraphifyProjectStatus;

/**
 * 检测某一个具体项目是否已生成 Graphify 图谱、是否过时。全程只读本地文件系统 + 本地 git 命令，
 * 不依赖任何外部仓库或配置项——与 {@link DomainKnowledgeStatusService} 依赖形态完全不同。
 */
public interface GraphifyProjectStatusService {

    GraphifyProjectStatus detectStatus(String projectRootPath);
}
