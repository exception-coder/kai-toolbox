package com.regentech_fashion.wyoooni.enterprise.infrastructure.persistence.jpa.binding;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/** 企业账号绑定的 Spring Data 仓储。 */
public interface AccountBindingJpaRepository extends JpaRepository<AccountBindingEntity, String> {
    Optional<AccountBindingEntity> findByIdAndActiveTrue(String id);
    Optional<AccountBindingEntity> findByAccountIdAndSourceSystemAndActiveTrue(
            String accountId, String sourceSystem);
}
