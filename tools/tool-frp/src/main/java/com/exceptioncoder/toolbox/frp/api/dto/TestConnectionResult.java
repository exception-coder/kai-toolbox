package com.exceptioncoder.toolbox.frp.api.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** SSH 连通性 + 远端 frp 安装状态的体检结果 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TestConnectionResult {
    /** SSH 是否登录成功 */
    private boolean connected;
    /** 远端识别到的 uname -srm 字符串 */
    private String unameOutput;
    /** install_dir 是否存在 */
    private boolean installDirExists;
    /** 是否检测到 frps 二进制 */
    private boolean hasFrps;
    /** 是否检测到 frpc 二进制 */
    private boolean hasFrpc;
    /** 是否存在 frps.toml */
    private boolean hasFrpsToml;
    /** 是否存在 frpc.toml */
    private boolean hasFrpcToml;
    /** 远端 frp 版本号（取自 frps -v 或 frpc -v） */
    private String version;
    /** 当连接失败时填入错误信息 */
    private String errorMessage;
}
