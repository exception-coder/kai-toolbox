package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.service.notify.NotificationSender;
import com.exceptioncoder.toolbox.common.featureconfig.service.FeatureConfigService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * 任务完成通知编排。
 *
 * 配置存在 feature-config 的 "claude-chat" 项下，结构：
 * <pre>
 * { "notify": {
 *     "bark": { "enabled": true, "baseUrl": "...", "deviceKey": "..." },
 *     "ntfy": { "enabled": true, "baseUrl": "...", "topic": "..." }
 * } }
 * </pre>
 * 允许同时开多个渠道（iPhone + Android）；未配置则静默跳过。
 */
@Slf4j
@Service
public class NotificationService {

    private static final String FEATURE_ID = "claude-chat";

    private final FeatureConfigService configService;
    private final ObjectMapper mapper;
    /** channel() -> sender，Spring 注入全部实现后建索引 */
    private final Map<String, NotificationSender> senders;

    public NotificationService(FeatureConfigService configService,
                               ObjectMapper mapper,
                               List<NotificationSender> senderList) {
        this.configService = configService;
        this.mapper = mapper;
        this.senders = senderList.stream()
                .collect(java.util.stream.Collectors.toMap(NotificationSender::channel, s -> s));
    }

    /** 遍历已启用渠道发送完成通知。任一渠道失败不影响其他渠道。 */
    public void notifyDone(String title, String body) {
        JsonNode notify = readNotifyConfig();
        if (notify == null || !notify.isObject()) {
            return;
        }
        notify.fields().forEachRemaining(entry -> {
            String channel = entry.getKey();
            JsonNode cfg = entry.getValue();
            if (cfg == null || !cfg.path("enabled").asBoolean(false)) {
                return;
            }
            NotificationSender sender = senders.get(channel);
            if (sender == null) {
                log.warn("[claude-chat] 未知通知渠道：{}", channel);
                return;
            }
            try {
                Map<String, Object> cfgMap = mapper.convertValue(cfg, Map.class);
                sender.send(cfgMap, title, body);
            } catch (Exception e) {
                log.warn("[claude-chat] 渠道 {} 推送失败：{}", channel, e.getMessage());
            }
        });
    }

    private JsonNode readNotifyConfig() {
        try {
            String json = configService.findRequired(FEATURE_ID).getValueJson();
            return mapper.readTree(json).path("notify");
        } catch (Exception e) {
            // 未配置（FeatureConfigNotFoundException）或解析失败 → 不推送
            return null;
        }
    }
}
