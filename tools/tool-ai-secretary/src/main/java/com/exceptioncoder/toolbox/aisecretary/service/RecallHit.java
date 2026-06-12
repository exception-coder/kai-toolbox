package com.exceptioncoder.toolbox.aisecretary.service;

import com.exceptioncoder.toolbox.aisecretary.domain.Note;

/**
 * 一条召回命中：由代码确定性检索得到的<b>真实库内记录</b> + 相似度分数 + 命中来源。
 *
 * <p>这是「确定性优先 / LLM 提议·代码裁决」的载体：召回到了什么、是什么分类、原文是什么，
 * 全部来自库（{@link Note}），<b>不经过模型转述</b>；模型只拿这些既成事实去组织最终答案。
 *
 * @param note   命中的真实记录（分类/原文/时间均为库内真值）
 * @param score  相似度分数；向量路为余弦分（0~1），关键字路为 null（精确命中无分数）
 * @param source 命中来源：向量 / 关键字 / 向量+关键字
 */
public record RecallHit(Note note, Double score, String source) {
}
