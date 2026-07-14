package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 「自动确保知识库就绪」结果：知识库目录不存在时自动 clone 到用户目录并绑定路径。
 *
 * @param status   ok=已配置且存在（无操作）；bound=发现本地已有克隆，直接绑定；cloned=已 clone 并绑定；
 *                 disabled=未配置 git 地址（不自动拉取）；error=拉取/绑定失败
 * @param kbDir    绑定后的知识库根目录（knowledge 子目录绝对路径）；失败为空串
 * @param target   克隆落地目录（~/.kai-toolbox/&lt;仓库名&gt;）
 * @param repoUrl  使用的 git 地址
 * @param message  面向用户的说明（error 时含失败原因，如未登录企业 Git 账号）
 */
public record KnowledgeEnsureResult(String status, String kbDir, String target, String repoUrl, String message) {
}
