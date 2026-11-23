package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.EngineCatalogView;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/** 读取并验证 Sidecar 引擎目录；不在 Java 层复制供应商探活规则。 */
@Service
public class EngineCatalogService {

    private static final long QUERY_TIMEOUT_MS = 30_000L;

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

    /** 以 Sidecar 探活结果裁决外部运行时引擎准入；内嵌引擎不增加同步查询开销。 */
    public boolean selectable(String engine) {
        return creationIssue(engine) == null;
    }

    /** 返回新建入口可展示的拒绝原因，探测原始输出仍由引擎目录提供。 */
    String creationIssue(String engine) {
        if (!"deepseekHarness".equals(engine) && !"antigravity".equals(engine) && !"trae".equals(engine)
                && !"zcode".equals(engine) && !"hermes".equals(engine)) return null;

        EngineCatalogView catalog = list(false);
        if (catalog.error() != null) {
            return "暂时无法读取 Sidecar 引擎目录。请刷新引擎状态后重试。";
        }
        EngineCatalogView.EngineEntry entry = catalog.engines().stream()
                .filter(candidate -> engine.equals(candidate.id()))
                .findFirst()
                .orElse(null);
        if (entry == null) return "当前 Sidecar 未登记所选引擎，请刷新引擎状态。";
        if (Boolean.TRUE.equals(entry.selectable())) return null;
        return entry.displayName() + switch (entry.probe().status()) {
            case "disabled" -> " 已禁用，请检查引擎配置。";
            case "dependencyMissing" -> " 缺少运行环境，请查看引擎状态。";
            case "incompatible" -> " 运行环境版本不兼容，请查看引擎状态。";
            default -> " 尚未通过运行检查，请刷新引擎状态后重试。";
        };
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
