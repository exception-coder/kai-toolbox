package com.exceptioncoder.toolbox.claudechat.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/** 读取 Sidecar 实际咨询路由函数的只读诊断结果。 */
@Service
public class SidecarRouteInspectionService {

    private static final long ROUTE_QUERY_TIMEOUT_MS = 2_000L;

    private final SidecarClient sidecarClient;

    public SidecarRouteInspectionService(SidecarClient sidecarClient) {
        this.sidecarClient = sidecarClient;
    }

    /** 核验源码根会启用的目标系统和只读 Tool；不可达时返回未验证。 */
    public Result inspect(String projectPath) {
        Optional<JsonNode> response = sidecarClient.inspectSystemRoute(
                projectPath, List.of(), ROUTE_QUERY_TIMEOUT_MS);
        if (response.isEmpty()) {
            return new Result("UNAVAILABLE", List.of(), List.of(), null);
        }
        JsonNode node = response.get();
        List<String> targets = new ArrayList<>();
        node.path("targetSystems").forEach(value -> targets.add(value.asText()));
        List<Tool> tools = new ArrayList<>();
        node.path("tools").forEach(value -> tools.add(new Tool(
                value.path("server").asText(), value.path("tool").asText())));
        Integer protocolVersion = node.has("protocolVersion") ? node.path("protocolVersion").asInt() : null;
        return new Result("VERIFIED", List.copyOf(targets), List.copyOf(tools), protocolVersion);
    }

    /**
     * Sidecar 路由诊断结果。
     *
     * @param status VERIFIED 或 UNAVAILABLE
     * @param targetSystems 实际目标系统
     * @param tools 实际要求的 MCP Tool
     * @param protocolVersion Sidecar 诊断协议版本
     */
    public record Result(String status, List<String> targetSystems, List<Tool> tools, Integer protocolVersion) {
    }

    /**
     * 一个运行时 MCP Tool 坐标。
     *
     * @param server MCP server 名
     * @param tool Tool 名
     */
    public record Tool(String server, String tool) {
    }
}
