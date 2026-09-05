package com.exceptioncoder.forge.sessionrelay;

import java.util.Optional;

/** 宿主可替换为加密持久化的参与者绑定存储。 */
public interface ForgeRelayBindingStore {

    void save(ForgeRelayBinding binding);

    Optional<ForgeRelayBinding> find(long subjectUserId);

    void remove(long subjectUserId);
}
