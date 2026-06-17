package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.util.List;

/**
 * 从工作区移除若干链接（只删链接，不动源目录）。
 *
 * @param dir   工作区目录绝对路径
 * @param links 要移除的链接名列表
 */
public record RemoveLinksRequest(String dir, List<String> links) {
}
