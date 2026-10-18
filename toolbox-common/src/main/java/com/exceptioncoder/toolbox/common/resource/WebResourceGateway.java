package com.exceptioncoder.toolbox.common.resource;

import java.util.List;

/** 复用系统资源绑定及账号，按咨询冻结的选择执行网页登录读取。 */
public interface WebResourceGateway {
    /** 返回不含密码的已绑定 Web 资源。 */
    List<ReadonlyResourceGateway.Entry> catalog();
    /** 只发现当前系统、已选绑定及允许的环境。 */
    List<ReadonlyResourceGateway.Entry> discover(String sourcePath, List<String> bindingIds);
    /** 明确环境/URL 后读取；不能扩大至未绑定的系统或地址。 */
    Object read(String runtimeId, String sourcePath, List<String> bindingIds, Request request);
    /** 资源身份与页面目标，不接受密码。 */
    record Request(@jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 100) String bindingId,
                   @jakarta.validation.constraints.Size(max = 2048) String url,
                   @jakarta.validation.constraints.Pattern(regexp = "LOCAL|DEV|TEST|UAT") String environment,
                   @jakarta.validation.constraints.Size(max = 512) String loginPage) { }
}
