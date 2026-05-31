package com.exceptioncoder.toolbox.hosts.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 全局 SSH 主机记录。被所有需要远程主机的工具复用（treesize / frp 等）。
 * id 由 UUID 生成，引用方只持久化 id 这一引用键。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Host {
    private String id;
    private String name;
    private String host;
    private int port;
    private String username;
    private HostAuthType authType;
    private String password;
    private String privateKey;
    private String passphrase;
    /** 自定义标签，比如 prod / staging / nas，用于侧边过滤 */
    private String tag;
    /** 自由备注 */
    private String note;
    private long createdAt;
    private long updatedAt;

    /** UI 单行展示用：username@host:port */
    public String label() {
        return "%s@%s:%d".formatted(username, host, port);
    }
}
