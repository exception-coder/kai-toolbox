package com.exceptioncoder.toolbox.claudechat.domain.delegation;

/** 服务端持有且不能由参与者放宽的委托执行画像。 */
public enum SessionDelegationProfile {
    /** Agent 可在绑定项目中开发，风险工具由会话所有者审批。 */
    DELEGATED_DEVELOPMENT,
    /** 参与者只提交和澄清需求，实际写操作由所有者接管。 */
    REQUEST_ONLY
}
