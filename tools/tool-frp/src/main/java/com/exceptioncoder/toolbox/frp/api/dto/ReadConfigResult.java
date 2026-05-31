package com.exceptioncoder.toolbox.frp.api.dto;

import com.exceptioncoder.toolbox.frp.domain.FrpMode;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ReadConfigResult {
    private FrpMode mode;
    /** 远端文件绝对路径 */
    private String remotePath;
    /** 文件是否存在 */
    private boolean exists;
    /** 文件原始内容（UTF-8） */
    private String content;
}
