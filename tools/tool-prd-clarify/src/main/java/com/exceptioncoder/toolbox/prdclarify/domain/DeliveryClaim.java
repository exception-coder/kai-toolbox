package com.exceptioncoder.toolbox.prdclarify.domain;

import java.util.List;

/**
 * 一版进度产物中的结构化交付声明。
 *
 * @param id 数据库 ID
 * @param sessionId PRD 会话 ID
 * @param artifactId 进度产物 ID
 * @param claimId 产物内稳定声明 ID
 * @param title 功能点标题
 * @param status 经服务端裁决后的完成状态
 * @param testItem 是否为测试类声明
 * @param evidences 源码证据核验快照
 * @param createdAt 创建时间
 */
public record DeliveryClaim(
        String id,
        String sessionId,
        String artifactId,
        String claimId,
        String title,
        DeliveryClaimStatus status,
        boolean testItem,
        List<DeliveryClaimEvidence> evidences,
        long createdAt) {
}
