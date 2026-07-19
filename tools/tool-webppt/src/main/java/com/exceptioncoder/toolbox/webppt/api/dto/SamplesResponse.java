package com.exceptioncoder.toolbox.webppt.api.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class SamplesResponse {
    private List<SampleInfo> samples;
}
