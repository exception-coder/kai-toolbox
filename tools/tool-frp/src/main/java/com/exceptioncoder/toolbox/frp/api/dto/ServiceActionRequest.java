package com.exceptioncoder.toolbox.frp.api.dto;

import com.exceptioncoder.toolbox.frp.domain.FrpMode;
import com.exceptioncoder.toolbox.frp.domain.FrpTarget;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 对远端 frp 进程做控制：status / restart / stop / start。
 * 默认走 systemctl；不存在时回退 pgrep + nohup。
 */
@Data
@EqualsAndHashCode(callSuper = false)
public class ServiceActionRequest extends FrpTarget {
    private FrpMode mode;
    /** status | restart | stop | start */
    private String action;
}
