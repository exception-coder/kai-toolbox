package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.util.List;

/** 会话独占原生记录的文件元信息；未知字节数保留 null。 */
public record SessionStorageView(
        /** Forge 逻辑会话 ID。 */ String sessionId,
        /** available / partial / pending / missing / unsupported / unavailable。 */ String status,
        /** 已知、去重后的文件逻辑长度；不是磁盘分配空间。 */ Long bytes,
        /** 实际计入的文件数量。 */ Integer fileCount,
        /** 本次读取元信息的时间。 */ Long checkedAt,
        /** 统计范围或不可获取原因。 */ String description,
        /** 各绑定引擎的统计结果。 */ List<EngineStorage> engines) {

    /** 单个原生引擎的独占文件统计。 */
    public record EngineStorage(
            /** 原生引擎标识。 */ String engine,
            /** 当前读取状态。 */ String status,
            /** 已知文件逻辑长度。 */ Long bytes,
            /** 已知文件数。 */ Integer fileCount,
            /** 范围或降级原因。 */ String description) { }
}
