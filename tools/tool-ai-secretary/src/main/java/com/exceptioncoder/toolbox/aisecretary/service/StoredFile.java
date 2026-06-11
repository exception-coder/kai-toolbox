package com.exceptioncoder.toolbox.aisecretary.service;

/** 附件落盘后的瞬态结果（尚未入库、尚未关联 note）。 */
public record StoredFile(String fileName, String mimeType, long sizeBytes, String storedPath) {
}
