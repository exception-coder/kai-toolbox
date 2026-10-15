package com.exceptioncoder.toolbox.foreconsult.config;

import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.ConfigDesc;
import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.Refreshable;
import com.exceptioncoder.toolbox.common.dynamicconfig.registry.DynamicConfigValidatable;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/** 咨询附件全局策略，复用配置中心的SQLite持久化与运行时刷新。 */
@Getter
@Setter
@Component
@Refreshable(name = "业务咨询附件", group = "业务咨询")
@ConfigurationProperties(prefix = ConsultAttachmentProperties.PREFIX)
public class ConsultAttachmentProperties implements DynamicConfigValidatable {
    public static final String PREFIX = "toolbox.fore-consult.attachments";
    @ConfigDesc("单文件上传上限（MiB，1至200）")
    private int uploadMaxMb = 100;
    @ConfigDesc("文本附件读取上限（MiB，1至200，不能超过上传上限）")
    private int readMaxMb = 50;

    @Override
    public void validateConfiguration() {
        if (uploadMaxMb < 1 || uploadMaxMb > 200 || readMaxMb < 1 || readMaxMb > uploadMaxMb) {
            throw new IllegalArgumentException("上传上限须为1至200 MiB，读取上限须为1至上传上限之间的整数");
        }
    }
}
