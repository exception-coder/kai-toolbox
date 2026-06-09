package com.exceptioncoder.toolbox.aisecretary.api.dto;

import java.util.List;

/**
 * 一次记录的结果。degraded=true 表示结构化抽取失败、已降级为「未分类」笔记（抗造点③）。
 */
public record CaptureResponse(boolean degraded, List<NoteView> items) {
}
