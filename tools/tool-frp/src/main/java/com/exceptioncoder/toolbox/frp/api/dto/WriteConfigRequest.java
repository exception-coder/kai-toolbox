package com.exceptioncoder.toolbox.frp.api.dto;

import com.exceptioncoder.toolbox.frp.domain.FrpMode;
import com.exceptioncoder.toolbox.frp.domain.FrpTarget;
import lombok.Data;
import lombok.EqualsAndHashCode;

/** 写入 install_dir 下的 frps.toml 或 frpc.toml；写入前自动备份为 *.bak.yyyyMMddHHmmss */
@Data
@EqualsAndHashCode(callSuper = false)
public class WriteConfigRequest extends FrpTarget {
    private FrpMode mode;
    /** 即将写入的完整 TOML 文本 */
    private String content;
}
