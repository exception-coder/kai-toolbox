package com.exceptioncoder.toolbox.claudechat.resources;

import com.exceptioncoder.toolbox.claudechat.service.ErpAppConfigService;
import com.exceptioncoder.toolbox.claudechat.service.ErpAppService;
import com.exceptioncoder.toolbox.claudechat.service.SrmAppConfigService;
import com.exceptioncoder.toolbox.claudechat.service.SrmAppService;
import com.exceptioncoder.toolbox.common.resource.ResourceProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** 现有应用连接器的装配点；增加连接器无需修改目录服务或协议层。 */
@Configuration
public class ApplicationResourceConfiguration {
    @Bean
    ResourceProvider erpApplicationResources(ErpAppConfigService configs, ErpAppService app) {
        return new ApplicationResourceProvider("erp-app", () -> {
            var config = configs.get();
            return config == null ? null : new ApplicationResourceProvider.Connection(config.baseUrl(),
                    config.username(), present(config.password()), config.isComplete());
        }, app::test, call -> app.call(call.method(), call.path(), call.params(), call.bodyType()));
    }

    @Bean
    ResourceProvider srmApplicationResources(SrmAppConfigService configs, SrmAppService app) {
        return new ApplicationResourceProvider("srm-app", () -> {
            var config = configs.get();
            return config == null ? null : new ApplicationResourceProvider.Connection(config.baseUrl(),
                    config.username(), present(config.password()), config.isComplete());
        }, app::test, call -> app.call(call.method(), call.path(), call.params(), call.bodyType()));
    }

    private static boolean present(String value) { return value != null && !value.isBlank(); }
}
