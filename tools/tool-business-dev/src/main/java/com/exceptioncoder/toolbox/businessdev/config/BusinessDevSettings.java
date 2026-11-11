package com.exceptioncoder.toolbox.businessdev.config;

/**
 * 业务系统开发配置（ERP / SRM / SCM 连接、应用账号等）的键值存储。
 *
 * <p>本模块只依赖此接口，不直接读写其他工具的表；由宿主提供实现，沿用已保存的配置。</p>
 */
public interface BusinessDevSettings {

    /** 读取配置原文；不存在时返回 null。 */
    String find(String name);

    /** 写入或覆盖配置原文。 */
    void upsert(String name, String payload);
}
