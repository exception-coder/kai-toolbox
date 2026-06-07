package com.exceptioncoder.toolbox.resume.api.dto;

import java.util.List;

/**
 * 技能标签整组替换入参。{@code skills} 为全集(非追加),空数组即清空。
 */
public record SkillsDto(List<String> skills) {
}
