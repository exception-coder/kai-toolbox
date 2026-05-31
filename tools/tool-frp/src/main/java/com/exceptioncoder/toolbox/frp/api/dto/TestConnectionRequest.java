package com.exceptioncoder.toolbox.frp.api.dto;

import com.exceptioncoder.toolbox.frp.domain.FrpTarget;
import lombok.Data;
import lombok.EqualsAndHashCode;

/** 体检：基于 hostId 找到主机，并探测 install_dir 下的 frps/frpc 二进制与配置文件。 */
@Data
@EqualsAndHashCode(callSuper = false)
public class TestConnectionRequest extends FrpTarget {
}
