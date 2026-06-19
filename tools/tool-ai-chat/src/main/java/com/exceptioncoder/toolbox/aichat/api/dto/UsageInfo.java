package com.exceptioncoder.toolbox.aichat.api.dto;

/**
 * 当前 API key（令牌）的用量信息，取自网关 {@code GET /api/usage/token}（仅凭 key 即可查）。
 * 额度按 {@code toolbox.ai-chat.quota-per-unit} 换算成美元。
 *
 * @param available    是否成功取到（网关不可达/未配 key 时为 false）
 * @param tokenName    令牌名称
 * @param unlimited    是否无限额度
 * @param expiresAt    过期时间（epoch 秒）；永不过期为 null
 * @param usedUsd      已用额度（美元）
 * @param grantedUsd   授予总额度（美元）；无限/为 0 时为 null
 * @param remainingUsd 剩余额度（美元）；无限额度时为 null
 * @param error        取数失败时的原因；成功为 null
 */
public record UsageInfo(
        boolean available,
        String tokenName,
        Boolean unlimited,
        Long expiresAt,
        Double usedUsd,
        Double grantedUsd,
        Double remainingUsd,
        String error) {

    public static UsageInfo unavailable(String error) {
        return new UsageInfo(false, null, null, null, null, null, null, error);
    }
}
