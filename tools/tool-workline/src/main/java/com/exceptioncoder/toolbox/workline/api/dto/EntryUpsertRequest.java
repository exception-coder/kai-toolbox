package com.exceptioncoder.toolbox.workline.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 工作条目新建 / 更新入参。coreContent（核心内容）与 achievement（成果）为可空长文本。
 *
 * <p>{@code parentId} 仅在创建明细子条目时传入：父条目须存在、属于同一工作线、且其自身为顶层
 * （仅两级）。更新时忽略该字段，不支持改挂父条目。
 */
public record EntryUpsertRequest(
        @NotBlank @Size(max = 200) String title,
        String coreContent,
        String achievement,
        Long parentId
) {}
