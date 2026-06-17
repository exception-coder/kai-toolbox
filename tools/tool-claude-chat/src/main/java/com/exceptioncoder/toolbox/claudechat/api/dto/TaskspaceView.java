package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.util.List;

/**
 * 一个合并工作区的当前视图：清单内容 + 每个链接的存活状态。
 *
 * @param dir     工作区目录绝对路径
 * @param name    工作区名
 * @param base    创建时的父目录
 * @param members 成员链接列表
 */
public record TaskspaceView(String dir, String name, String base, List<MemberView> members) {

    /**
     * @param link   工作区内的链接名
     * @param target 链接指向的源目录绝对路径
     * @param alive  链接当前是否仍存在且为链接（false=链接已被外部删除/损坏）
     */
    public record MemberView(String link, String target, boolean alive) {
    }
}
