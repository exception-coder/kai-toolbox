package com.exceptioncoder.toolbox.ops.resources.domain;

import java.util.List;

public interface ResourceBindingStore {
    List<ResourceBinding> list();
    void save(ResourceBinding binding);
    void delete(String id);
}
