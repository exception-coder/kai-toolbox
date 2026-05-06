package com.exceptioncoder.toolbox.treesize.api.dto;

import java.util.List;

public record VideoConfigView(List<String> videoExtensions, boolean ffmpegAvailable) {}
