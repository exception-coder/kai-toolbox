package com.exceptioncoder.toolbox.projects.registry.domain;

import java.util.List;
import java.util.Map;

/** 不可变系统画像；资产引用权威来源，不复制代码图谱。 */
public record SystemProfile(
        /** 所属系统。 */ String projectId,
        /** 单调递增版本。 */ Integer version,
        /** 完成时间。 */ Long generatedAt,
        /** 源码内容指纹。 */ String fingerprint,
        /** 画像就绪结论。 */ String state,
        /** 五类资产。 */ List<Asset> assets,
        /** 未满足的证据要求。 */ List<String> gaps
) {
    /** 资产摘要及可追溯文件入口。 */
    public record Asset(
            /** 稳定资产类型。 */ String kind,
            /** 展示名称。 */ String title,
            /** READY、PARTIAL 或 MISSING。 */ String status,
            /** 相对项目根的证据路径。 */ List<String> sources,
            /** 已确认的摘要信息。 */ Map<String, String> facts
    ) { }
}
