package com.exceptioncoder.toolbox.flatten.api.dto;

import java.util.List;

public record DuplicateGroupView(
        String hash,
        long size,
        List<FileItemView> files
) {}
