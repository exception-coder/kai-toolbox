package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.EngineCatalogView;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/** 读取并验证 Sidecar 引擎目录；不在 Java 层复制供应商探活规则。 */
@Service
public class EngineCatalogService {

    private static final Logger log = LoggerFactory.getLogger(EngineCatalogService.class);
    // Cold catalog reads also include the dsh handshake and subprocess cleanup (90s + teardown).
    private static final long CATALOG_TIMEOUT_MS = 100_000L;
    private static final long OTHER_ENGINE_ADMISSION_TIMEOUT_MS = 30_000L;

    private final SidecarClient sidecarClient;
    private final SidecarProcessRegistry processRegistry;

    public EngineCatalogService(SidecarClient sidecarClient, SidecarProcessRegistry processRegistry) {
        this.sidecarClient = sidecarClient;
        this.processRegistry = processRegistry;
    }

    /** 返回权威目录；Sidecar 不可达时返回显式错误和空目录。 */
    public EngineCatalogView list(boolean refresh) {
        return load(refresh, CATALOG_TIMEOUT_MS);
    }

    /** 管理员主动检测时复用正常的 Sidecar 冷启动入口。 */
    public EngineCatalogView refresh() {
        if (!sidecarClient.isConnected()) {
            try {
                processRegistry.ensureStarted();
                sidecarClient.ensureConnected();
            } catch (IOException exception) {
                log.warn("[claude-chat] 重新检测引擎时无法启动 Sidecar：{}", exception.getMessage());
                return new EngineCatalogView(1, List.of(), "Sidecar 启动失败，请查看 Forge 后端日志后重试。");
            }
        }
        return list(true);
    }

    private EngineCatalogView load(boolean refresh, long timeoutMs) {
        return sidecarClient.queryEngineCatalog(refresh, timeoutMs)
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

        EngineCatalogView catalog = load(false, "deepseekHarness".equals(engine)
                ? CATALOG_TIMEOUT_MS : OTHER_ENGINE_ADMISSION_TIMEOUT_MS);
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
