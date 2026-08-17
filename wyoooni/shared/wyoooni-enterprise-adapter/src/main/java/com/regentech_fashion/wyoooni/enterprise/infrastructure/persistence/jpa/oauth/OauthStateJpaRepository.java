package com.regentech_fashion.wyoooni.enterprise.infrastructure.persistence.jpa.oauth;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

/** OAuth state 的 Spring Data 仓储。 */
public interface OauthStateJpaRepository extends JpaRepository<OauthStateEntity, String> {
    @Query("select state from OauthStateEntity state where state.id = :id "
            + "and state.consumedAt is null and state.expiresAt >= :now")
    Optional<OauthStateEntity> findConsumable(@Param("id") String id, @Param("now") long now);

    @Modifying(clearAutomatically = true)
    @Query("update OauthStateEntity state set state.consumedAt = :now, state.updateTime = :now "
            + "where state.id = :id and state.consumedAt is null and state.expiresAt >= :now")
    int consume(@Param("id") String id, @Param("now") long now);
}
