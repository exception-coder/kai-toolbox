package com.exceptioncoder.toolbox.frp.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 某台主机上的一个 frp 角色配置（frps 或 frpc，独立记录）。
 * 复合主键 (hostId, mode)：同一台主机上的 frps / frpc 各自独立保存自己的 installDir + 表单 JSON。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FrpHostTarget {
    private String hostId;
    private FrpMode mode;
    private String installDir;
    /** 前端 FrpsConfig 或 FrpcConfig 的 JSON 串，后端不解析只透传 */
    private String configJson;
    private long updatedAt;
}
