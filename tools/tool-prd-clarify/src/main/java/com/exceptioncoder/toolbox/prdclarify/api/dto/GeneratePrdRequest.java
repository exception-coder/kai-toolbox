package com.exceptioncoder.toolbox.prdclarify.api.dto;

/**
 * 生成/更新 PRD 的请求体（可选，缺省即原有行为——从零生成）。
 *
 * @param extraInstructions update 模式下用户补充的本次更新说明（可选，null/空表示不追加，
 *                          交给 Claude 自行审视当前内容并适度完善）。
 * @param updateExisting    true = 基于当前已有 PRD 内容做增量更新（复用「生成修订版」同一套
 *                          system prompt 和输入格式约定，见 PrdClarifyService#generate 注释，
 *                          区别是不新建会话、原地覆盖同一份文件，旧版本自动备份）；
 *                          false/null = 从原始需求描述+澄清问答从零生成/覆盖（原有行为，默认）。
 */
public record GeneratePrdRequest(String extraInstructions, Boolean updateExisting, String engine, Boolean background) {
}
