package com.exceptioncoder.toolbox.common.resource;

import java.util.List;

/** 复用系统资源绑定及账号执行网页登录读取。 */
public interface WebResourceGateway {
    /** 返回不含密码的已绑定 Web 资源。 */
    List<ReadonlyResourceGateway.Entry> catalog();
    /** 只发现当前系统、已选绑定及允许的环境。 */
    List<ReadonlyResourceGateway.Entry> discover(String sourcePath, List<String> bindingIds);
    /** 平台网页排查使用当前系统绑定；仍由实现复核唯一系统和资源状态。 */
    default List<ReadonlyResourceGateway.Entry> discoverBound(String sourcePath) {
        return discover(sourcePath, catalog().stream().map(ReadonlyResourceGateway.Entry::bindingId).toList());
    }
    /** 明确环境/URL 后读取；不能扩大至未绑定的系统或地址。 */
    Object read(String runtimeId, String sourcePath, List<String> bindingIds, Request request);
    /** 本人经鉴权表单授予的临时账号；调用者负责所有权、有效期和撤销。 */
    Object readPersonal(String contextKey, String sourcePath, BrowserLoginTarget account, Request request);
    void closePersonal(String contextKey);
    /** 资源身份与页面目标，不接受密码。 */
    record Request(@jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 100) String bindingId,
                   @jakarta.validation.constraints.Size(max = 2048) String url,
                   @jakarta.validation.constraints.Pattern(regexp = "LOCAL|DEV|TEST|UAT") String environment,
                   @jakarta.validation.constraints.Size(max = 512) String loginPage,
                   @jakarta.validation.constraints.Size(max = 120) String menuName) {
        public Request(String bindingId, String url, String environment, String loginPage) {
            this(bindingId, url, environment, loginPage, null);
        }

        public Request {
            if (menuName != null && (menuName.isBlank() || menuName.length() > 120 || menuName.chars().anyMatch(Character::isISOControl))) {
                throw new IllegalArgumentException("请提供页面上明确的菜单名称（最多120个字符）");
            }
        }
    }
}
