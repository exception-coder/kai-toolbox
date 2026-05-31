package com.exceptioncoder.toolbox.browserrequest.api.dto;

/**
 * 启动一次新录制的请求体。所有字段可空，null 时套 RecordingService 的默认值。
 *
 * - captureXxx：xhr/fetch 默认开，document/script 默认关
 * - responseBodyTruncateAtBytes：响应体存多大上限（字节）。null 用后端默认；
 *   超过 BrowserRequestProperties.responseBodyMaxBytes 时会被夹到该上限。
 */
public record StartRecordingRequest(
        String name,
        Boolean captureXhr,
        Boolean captureFetch,
        Boolean captureDocument,
        Boolean captureScript,
        Integer responseBodyTruncateAtBytes
) {
}
