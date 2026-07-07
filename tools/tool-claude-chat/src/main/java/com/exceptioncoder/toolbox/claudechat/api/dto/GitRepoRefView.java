package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 会话工作目录下的一个 git 仓库引用。用于「提交记录」适配「父目录当工作目录、子目录才是 git 仓库」的场景
 * （如 taskspace 聚合目录、含多个项目的父目录）。
 *
 * @param name   相对会话 cwd 的仓库定位：空串=cwd 本身即仓库；否则为直接子目录名（提交查询时回传给后端）
 * @param label  展示名
 * @param isRoot 是否为 cwd 本身
 */
public record GitRepoRefView(String name, String label, boolean isRoot) {
}
