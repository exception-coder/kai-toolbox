package com.exceptioncoder.toolbox.browserrequest.preview;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 用户接管后的基础操作；不支持注入脚本或任意网络请求。 */
public record PreviewInput(@NotBlank String type, Double x, Double y,
                           @Size(max = 1000) String text, @Size(max = 40) String key, Double deltaY) { }
