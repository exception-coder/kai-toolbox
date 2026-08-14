package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.util.List;

/** Sidecar 权威引擎目录，实验引擎只有通过运行时握手后才允许选择。 */
public record EngineCatalogView(
        /** Sidecar 引擎目录协议版本。 */
        Integer protocolVersion,
        /** 当前可发现的稳定与实验引擎。 */
        List<EngineEntry> engines,
        /** 目录查询失败说明；成功时为空。 */
        String error
) {
    /** 单个引擎的能力、发布级别和实时可选择状态。 */
    public record EngineEntry(
            /** 稳定引擎标识。 */
            String id,
            /** 用户界面显示名。 */
            String displayName,
            /** Adapter 声明的真实能力集合。 */
            List<String> capabilities,
            /** stable 或 experimental。 */
            String availability,
            /** 当前 Sidecar 是否允许创建或切换到该引擎。 */
            Boolean selectable,
            /** 外部运行时探活结果。 */
            Probe probe
    ) {
    }

    /** 外部 SDK 与 Runtime 的握手结果，不包含凭据或完整本机路径。 */
    public record Probe(
            /** ready、disabled、dependencyMissing、incompatible 或 unavailable。 */
            String status,
            /** 实际通道，例如 official-sdk-jsonrpc。 */
            String channel,
            /** 当前 SDK 版本。 */
            String sdkVersion,
            /** Runtime 身份。 */
            String runtimeName,
            /** Runtime 版本。 */
            String runtimeVersion,
            /** 可供用户排障的脱敏说明。 */
            String detail
    ) {
    }
}
