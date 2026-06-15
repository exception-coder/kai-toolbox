package com.exceptioncoder.toolbox.java8gu.api.dto;

/**
 * 复习问答请求。
 *
 * @param question   问题
 * @param categoryId 可选分类目录 id（如 03_并发编程）；非空则把检索限定在该分类内
 */
public record AskRequest(String question, String categoryId) {
}
