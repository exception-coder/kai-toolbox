package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.EngineCatalogView;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/** 读取并验证 Sidecar 引擎目录；不在 Java 层复制供应商探活规则。 */
@Service
public class EngineCatalogService {

    private static final long QUERY_TIMEOUT_MS = 5_000L;

    private final SidecarClient sidecarClient;

    public EngineCatalogService(SidecarClient sidecarClient) {
        this.sidecarClient = sidecarClient;
    }

    /** 返回权威目录；Sidecar 不可达时返回显式错误和空目录。 */
    public EngineCatalogView list(boolean refresh) {
        return sidecarClient.queryEngineCatalog(refresh, QUERY_TIMEOUT_MS)
                .map(this::parse)
                .orElseGet(() -> new EngineCatalogView(1, List.of(), "Sidecar 引擎目录不可用"));
    }

    /** 以 Sidecar 探活结果裁决实验引擎准入；稳定引擎不增加同步查询开销。 */
    public boolean selectable(String engine) {
        if (!"deepseekHarness".equals(engine)) {
            return true;
        }
        return list(false).engines().stream()
                .anyMatch(entry -> engine.equals(entry.id()) && Boolean.TRUE.equals(entry.selectable()));
    }

    private EngineCatalogView parse(JsonNode root) {
        List<EngineCatalogView.EngineEntry> engines = new ArrayList<>();
        JsonNode source = root.path("engines");
        if (source.isArray()) {
            source.forEach(node -> engines.add(parseEntry(node)));
        }
        String error = textOrNull(root.path("error"));
        return new EngineCatalogView(root.path("protocolVersion").asInt(1), List.copyOf(engines), error);
    }

    private EngineCatalogView.EngineEntry parseEntry(JsonNode node) {
        List<String> capabilities = new ArrayList<>();
        JsonNode capabilitySource = node.path("capabilities");
        if (capabilitySource.isArray()) {
            capabilitySource.forEach(value -> {
                if (value.isTextual()) {
                    capabilities.add(value.asText());
                }
            });
        }
        JsonNode probe = node.path("probe");
        return new EngineCatalogView.EngineEntry(
                node.path("id").asText(),
                node.path("displayName").asText(),
                List.copyOf(capabilities),
                node.path("availability").asText(),
                node.path("selectable").asBoolean(false),
                new EngineCatalogView.Probe(
                        probe.path("status").asText("unavailable"),
                        textOrNull(probe.path("channel")),
                        textOrNull(probe.path("sdkVersion")),
                        textOrNull(probe.path("runtimeName")),
                        textOrNull(probe.path("runtimeVersion")),
                        textOrNull(probe.path("detail"))
                )
        );
    }

    private static String textOrNull(JsonNode value) {
        return value.isTextual() && !value.asText().isBlank() ? value.asText() : null;
    }
}
