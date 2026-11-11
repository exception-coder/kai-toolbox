package com.exceptioncoder.toolbox.claudechat.config;

import com.exceptioncoder.toolbox.businessdev.config.BusinessDevSettings;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSettingRepository;
import org.springframework.stereotype.Component;

/**
 * 业务系统开发模块的配置存储：沿用 claude_chat_setting 中已保存的 ERP / SRM / SCM 配置键，迁出模块后无需迁移数据。
 */
@Component
public class BusinessDevSettingsAdapter implements BusinessDevSettings {

    private final ClaudeChatSettingRepository settings;

    public BusinessDevSettingsAdapter(ClaudeChatSettingRepository settings) {
        this.settings = settings;
    }

    @Override
    public String find(String name) {
        return settings.find(name);
    }

    @Override
    public void upsert(String name, String payload) {
        settings.upsert(name, payload);
    }
}
