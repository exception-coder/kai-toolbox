package com.exceptioncoder.toolbox.common.resource;

import java.util.List;

/** 由资源所属模块提供的网页登录配置；凭据仅供服务端浏览器消费。 */
public interface BrowserLoginResources {
    /** 可发现的非生产应用登录目标。 */
    List<BrowserLoginTarget> targets();
    /** 读取服务端凭据，不得经 API 或 Agent 上下文返回。 */
    BrowserLoginTarget require(String id);

    /** 人工预览候选；调用方必须核验管理员身份及生产环境确认，不供 Agent 资源发现使用。 */
    default List<BrowserLoginTarget> interactiveTargets() { return targets(); }

    /** 人工预览专用凭据读取，不能替代 Agent 使用的 require。 */
    default BrowserLoginTarget requireInteractive(String id) { return require(id); }
}
