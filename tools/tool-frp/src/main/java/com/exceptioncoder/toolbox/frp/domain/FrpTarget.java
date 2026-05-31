package com.exceptioncoder.toolbox.frp.domain;

import lombok.Data;

/**
 * frp 操作的远端目标：引用已登记的全局主机 + frp 安装目录。
 * 所有 frp API 入参都基于这一对值定位远端。
 */
@Data
public class FrpTarget {
    /** /api/hosts 里登记的主机 id */
    private String hostId;
    /** frp 安装目录绝对路径，例如 /opt/frp */
    private String installDir;
}
