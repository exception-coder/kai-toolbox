package com.exceptioncoder.toolbox.browserrequest.preview;

import com.exceptioncoder.toolbox.common.resource.BrowserLoginTarget;

/** 服务端临时执行上下文；认证快照与凭据不落盘、不向视图返回。 */
record PreviewPlan(String origin, String route, String loginPage, String readySelector, String scene,
                   boolean phone, String storageState, BrowserLoginTarget login, boolean readOnly) {
    PreviewPlan(String origin, String route, String loginPage, String readySelector, String scene,
                boolean phone, String storageState, BrowserLoginTarget login) {
        this(origin, route, loginPage, readySelector, scene, phone, storageState, login, false);
    }
    @Override public String toString() { return "PreviewPlan[origin=" + origin + "]"; }
}
