package com.exceptioncoder.toolbox.frp.api.dto;

import com.exceptioncoder.toolbox.frp.domain.FrpMode;
import com.exceptioncoder.toolbox.frp.domain.FrpTarget;
import lombok.Data;
import lombok.EqualsAndHashCode;

/** 读取 install_dir 下的 frps.toml 或 frpc.toml */
@Data
@EqualsAndHashCode(callSuper = false)
public class ReadConfigRequest extends FrpTarget {
    private FrpMode mode;
}
