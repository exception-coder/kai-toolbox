package com.exceptioncoder.toolbox.prdclarify.domain;

/** Delivery 功能声明的受控完成状态。 */
public enum DeliveryClaimStatus {

    /** 功能已实现且至少有一条服务端验证通过的源码证据。 */
    COMPLETED,

    /** 功能只完成一部分，或完成声明缺少可验证证据。 */
    PARTIAL,

    /** 当前代码中未实现该功能。 */
    MISSING
}
