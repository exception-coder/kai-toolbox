package com.exceptioncoder.toolbox.projects.api.dto;

import java.time.OffsetDateTime;

/**
 * 单个项目卡片的元数据。
 *
 * @param name         项目目录名（一级子目录名）
 * @param path         绝对路径，Windows 反斜杠原样保留，由 Jackson 默认序列化
 * @param type         按签名识别得到的项目类型，序列化为小写字符串
 * @param branch       Git 当前分支；非 git 项目或读取失败时为 {@code null}
 * @param lastModified 文件系统 mtime，ISO-8601 带时区
 */
public record ProjectInfo(
        String name,
        String path,
        ProjectType type,
        String branch,
        OffsetDateTime lastModified
) {
}
