package com.exceptioncoder.toolbox.knowledgegraph.service;

import com.exceptioncoder.toolbox.knowledgegraph.api.dto.GraphifyGraphView;

/** 读取项目 graphify-out/graph.json，返回可供 3D 力导图渲染的（按度数截断的）子图。 */
public interface GraphifyGraphService {

    /**
     * @param projectRootPath 项目根（其下须有 graphify-out/graph.json）
     * @param limit           渲染节点上限（按度数取 Top-N）；&le;0 用默认
     */
    GraphifyGraphView loadGraph(String projectRootPath, int limit);
}
