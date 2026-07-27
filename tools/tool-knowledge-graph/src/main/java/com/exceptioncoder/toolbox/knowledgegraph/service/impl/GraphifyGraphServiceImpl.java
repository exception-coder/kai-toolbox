package com.exceptioncoder.toolbox.knowledgegraph.service.impl;

import com.exceptioncoder.toolbox.knowledgegraph.api.dto.GraphifyGraphView;
import com.exceptioncoder.toolbox.knowledgegraph.service.GraphifyGraphService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Service
public class GraphifyGraphServiceImpl implements GraphifyGraphService {

    private static final int DEFAULT_LIMIT = 1200;
    private static final int MAX_LIMIT = 3000;

    private final ObjectMapper mapper;

    public GraphifyGraphServiceImpl(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public GraphifyGraphView loadGraph(String projectRootPath, int limit) {
        if (projectRootPath == null || projectRootPath.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请提供项目根路径");
        }
        int cap = limit <= 0 ? DEFAULT_LIMIT : Math.min(limit, MAX_LIMIT);
        Path graphFile = Path.of(projectRootPath).resolve("graphify-out").resolve("graph.json");
        if (!Files.isRegularFile(graphFile)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "未找到 Graphify 图：" + graphFile + "（请先在该项目跑 graphify 生成 graphify-out/graph.json）");
        }

        JsonNode root;
        try {
            root = mapper.readTree(graphFile.toFile());
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "解析 graph.json 失败：" + e.getMessage());
        }
        JsonNode nodesNode = root.get("nodes");
        JsonNode linksNode = root.get("links");
        if (nodesNode == null || !nodesNode.isArray()) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "graph.json 缺少 nodes 数组");
        }
        int total = nodesNode.size();

        // 1) 统计每个节点的度数（用于 Top-N 截断，保留结构最"核心"的节点）
        Map<String, Integer> degree = new HashMap<>();
        if (linksNode != null && linksNode.isArray()) {
            for (JsonNode l : linksNode) {
                String s = asId(l.get("source"));
                String t = asId(l.get("target"));
                if (s != null) degree.merge(s, 1, Integer::sum);
                if (t != null) degree.merge(t, 1, Integer::sum);
            }
        }

        // 2) 选中要渲染的节点：节点数超限时按度数取 Top-N
        List<JsonNode> allNodes = new ArrayList<>(total);
        nodesNode.forEach(allNodes::add);
        boolean truncated = total > cap;
        List<JsonNode> chosen;
        if (truncated) {
            chosen = new ArrayList<>(allNodes);
            chosen.sort(Comparator.comparingInt((JsonNode n) -> degree.getOrDefault(asId(n.get("id")), 0)).reversed());
            chosen = chosen.subList(0, cap);
        } else {
            chosen = allNodes;
        }

        Set<String> kept = new HashSet<>();
        List<GraphifyGraphView.Node> outNodes = new ArrayList<>(chosen.size());
        for (JsonNode n : chosen) {
            String id = asId(n.get("id"));
            if (id == null || !kept.add(id)) continue;
            outNodes.add(new GraphifyGraphView.Node(
                    id,
                    text(n.get("label"), id),
                    text(n.get("file_type"), null),
                    n.hasNonNull("community") ? n.get("community").asInt() : null,
                    text(n.get("community_name"), null)));
        }

        // 3) 只保留两端都在渲染集合里的边
        List<GraphifyGraphView.Link> outLinks = new ArrayList<>();
        if (linksNode != null && linksNode.isArray()) {
            for (JsonNode l : linksNode) {
                String s = asId(l.get("source"));
                String t = asId(l.get("target"));
                if (s == null || t == null || !kept.contains(s) || !kept.contains(t)) continue;
                outLinks.add(new GraphifyGraphView.Link(s, t, text(l.get("relation"), null)));
            }
        }

        return new GraphifyGraphView(total, outNodes.size(), truncated, outNodes, outLinks);
    }

    private static String asId(JsonNode n) {
        return n == null || n.isNull() ? null : n.asText();
    }

    private static String text(JsonNode n, String fallback) {
        return n == null || n.isNull() ? fallback : n.asText();
    }
}
