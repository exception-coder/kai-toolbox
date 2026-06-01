package com.exceptioncoder.toolbox.claudechat.service.notify;

/** 推送渠道。一个实现对应一种手机平台/服务。 */
public interface NotificationSender {

    /** 渠道标识，与 feature-config 里的 channel 配置对应（如 bark / ntfy） */
    String channel();

    /**
     * 发送一条推送。
     *
     * @param cfg   该渠道的配置子树（baseUrl / deviceKey / topic 等）
     * @param title 通知标题
     * @param body  通知正文
     */
    void send(java.util.Map<String, Object> cfg, String title, String body);
}
