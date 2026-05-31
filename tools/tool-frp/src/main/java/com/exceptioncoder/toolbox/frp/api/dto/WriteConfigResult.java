package com.exceptioncoder.toolbox.frp.api.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class WriteConfigResult {
    /** 远端真实写入的路径 */
    private String remotePath;
    /** 备份文件路径，没备份时为 null */
    private String backupPath;
    /** 写入字节数 */
    private long bytesWritten;
}
