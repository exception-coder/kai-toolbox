package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 团队知识库初始化目录检查结果。
 *
 * @param status   ok=固定目录存在；disabled=尚未执行团队依赖初始化；其余值兼容旧版接口
 * @param kbDir    固定知识库目录
 * @param target   旧版接口兼容字段
 * @param repoUrl  旧版接口兼容字段
 * @param message  面向用户的说明（error 时含失败原因，如未登录企业 Git 账号）
 */
public record KnowledgeEnsureResult(String status, String kbDir, String target, String repoUrl, String message) {
}
