package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.util.List;

/**
 * 列举某父目录一级子目录的结果，供 taskspace「合并工作区」多选。
 *
 * @param parent 规范化后的父目录绝对路径
 * @param exists 父目录是否存在且为可读目录
 * @param dirs   一级子目录（已过滤隐藏前缀、按名称升序）
 */
public record SubdirListResponse(String parent, boolean exists, List<TaskspaceDirView> dirs) {
}
