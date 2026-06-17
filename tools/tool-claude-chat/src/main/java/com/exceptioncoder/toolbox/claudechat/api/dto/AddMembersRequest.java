package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.util.List;

/**
 * 向已有工作区追加链接。
 *
 * @param dir     工作区目录绝对路径（须含 .taskspace.json 清单）
 * @param members 追加的源项目目录绝对路径列表
 */
public record AddMembersRequest(String dir, List<String> members) {
}
