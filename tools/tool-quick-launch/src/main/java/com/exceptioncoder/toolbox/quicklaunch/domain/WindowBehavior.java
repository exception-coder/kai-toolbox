package com.exceptioncoder.toolbox.quicklaunch.domain;

/** 快捷站点在独立窗口中的页面弹窗约束策略。 */
public enum WindowBehavior {
    /** 保留业务站点原生的新窗口行为。 */
    STANDARD,
    /** 通过受控容器阻止业务站点继续派生窗口。 */
    CONTROLLED,
    /** 优先使用受控容器，并向用户提供标准模式回退。 */
    AUTO
}
