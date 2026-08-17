package com.regentech_fashion.wyoooni.enterprise.infrastructure.persistence.jpa.binding;

import com.regentech_fashion.wyoooni.enterprise.domain.identity.AccountBindingStore;
import com.regentech_fashion.wyoooni.enterprise.domain.identity.EnterpriseAccountBinding;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/** 基于 JPA 实现企业账号绑定存储。 */
public class JpaAccountBindingStore implements AccountBindingStore {
    private final AccountBindingJpaRepository repository;

    public JpaAccountBindingStore(AccountBindingJpaRepository repository) {
        this.repository = repository;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<EnterpriseAccountBinding> findBySubject(String subjectHash) {
        return repository.findByIdAndActiveTrue(subjectHash).map(JpaAccountBindingStore::toDomain);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<BindingOwner> findByAccount(String accountId, String sourceSystem) {
        return repository.findByAccountIdAndSourceSystemAndActiveTrue(accountId, sourceSystem)
                .map(entity -> new BindingOwner(entity.id(), entity.accountId(), entity.sourceSystem()));
    }

    @Override
    @Transactional
    public EnterpriseAccountBinding insert(String subjectHash, EnterpriseAccountBinding binding, long now) {
        repository.save(new AccountBindingEntity(subjectHash, binding.accountId(), binding.username(),
                binding.displayName(), binding.businessPartyId(), binding.businessPartyName(),
                binding.sourceSystem(), now));
        return binding;
    }

    private static EnterpriseAccountBinding toDomain(AccountBindingEntity entity) {
        return new EnterpriseAccountBinding(entity.accountId(), entity.username(), entity.displayName(),
                entity.businessPartyId(), entity.businessPartyName(), entity.sourceSystem());
    }
}
