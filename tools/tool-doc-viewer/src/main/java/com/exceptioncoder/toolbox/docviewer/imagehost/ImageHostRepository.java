package com.exceptioncoder.toolbox.docviewer.imagehost;

import com.exceptioncoder.toolbox.common.resource.ResourceCredentialCipher;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import static com.exceptioncoder.toolbox.docviewer.imagehost.ImageHostModels.*;

@Repository
public class ImageHostRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final ResourceCredentialCipher cipher;

    public ImageHostRepository(JdbcTemplate jdbc, ObjectMapper mapper, ResourceCredentialCipher cipher) {
        this.jdbc = jdbc; this.mapper = mapper; this.cipher = cipher;
    }

    public List<View> list(long owner) {
        return jdbc.query("SELECT id,settings_json,is_default FROM doc_image_host WHERE owner_id=? ORDER BY is_default DESC,updated_at DESC",
                (rs, n) -> new View(rs.getString(1), decode(rs.getString(2), Settings.class), true, rs.getBoolean(3)), owner);
    }

    public Optional<Stored> find(long owner, String id) {
        return jdbc.query("SELECT * FROM doc_image_host WHERE owner_id=? AND id=?", (rs, n) ->
                new Stored(rs.getString("id"), owner, decode(rs.getString("settings_json"), Settings.class),
                        decode(cipher.decrypt(rs.getString("credentials")), Credentials.class), rs.getBoolean("is_default")), owner, id)
                .stream().findFirst();
    }

    @Transactional
    public View save(Stored profile) {
        boolean useDefault = profile.isDefault() || list(profile.ownerId()).isEmpty();
        int changed = jdbc.update("""
                INSERT INTO doc_image_host(id,owner_id,settings_json,credentials,is_default,updated_at) VALUES(?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET settings_json=excluded.settings_json,credentials=excluded.credentials,
                    is_default=excluded.is_default,updated_at=excluded.updated_at WHERE doc_image_host.owner_id=excluded.owner_id
                """, profile.id(), profile.ownerId(), encode(profile.settings()), cipher.encrypt(encode(profile.credentials())),
                useDefault, System.currentTimeMillis());
        if (changed != 1) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,"图床配置编号不可用，请重新开始新增");
        if (useDefault) jdbc.update("UPDATE doc_image_host SET is_default=CASE WHEN id=? THEN 1 ELSE 0 END WHERE owner_id=?", profile.id(),profile.ownerId());
        return new View(profile.id(), profile.settings(), true, useDefault);
    }

    @Transactional
    public void delete(long owner, String id) {
        jdbc.update("DELETE FROM doc_image_host WHERE owner_id=? AND id=?", owner, id);
        jdbc.update("""
                UPDATE doc_image_host SET is_default=1 WHERE owner_id=? AND id=(
                  SELECT id FROM doc_image_host WHERE owner_id=? ORDER BY is_default DESC,updated_at DESC LIMIT 1)
                """, owner, owner);
    }

    public Optional<Receipt> receipt(long owner, String requestId) {
        return jdbc.query("SELECT * FROM doc_image_upload WHERE owner_id=? AND request_id=?", (rs,n) ->
                new Receipt(rs.getString("request_id"), rs.getString("profile_id"), rs.getString("object_key"),
                        rs.getString("image_url"), rs.getString("file_name"), rs.getString("state")), owner, requestId).stream().findFirst();
    }

    public boolean claim(long owner, Receipt r, String digest) {
        return jdbc.update("""
                INSERT INTO doc_image_upload(owner_id,request_id,profile_id,digest,object_key,image_url,file_name,state,created_at)
                VALUES(?,?,?,?,?,?,?,'UPLOADING',?) ON CONFLICT(owner_id,request_id) DO NOTHING
                """, owner, r.requestId(), r.profileId(), digest, r.objectKey(), r.url(), r.fileName(), System.currentTimeMillis()) == 1;
    }

    public boolean matches(long owner, String requestId, String profileId, String digest) {
        return jdbc.queryForObject("SELECT count(*) FROM doc_image_upload WHERE owner_id=? AND request_id=? AND profile_id=? AND digest=?",
                Integer.class, owner, requestId, profileId, digest) == 1;
    }

    public void finish(long owner, String requestId, String state) {
        jdbc.update("UPDATE doc_image_upload SET state=? WHERE owner_id=? AND request_id=?", state, owner, requestId);
    }

    public List<Receipt> recent(long owner) {
        return jdbc.query("SELECT * FROM doc_image_upload WHERE owner_id=? ORDER BY created_at DESC LIMIT 30", (rs,n) ->
                new Receipt(rs.getString("request_id"), rs.getString("profile_id"), rs.getString("object_key"),
                        rs.getString("image_url"), rs.getString("file_name"), rs.getString("state")), owner);
    }

    private String encode(Object value) {
        try { return mapper.writeValueAsString(value); }
        catch (Exception e) { throw new IllegalStateException("图床配置编码失败"); }
    }
    private <T> T decode(String text, Class<T> type) {
        try { return mapper.readValue(text, type); }
        catch (Exception e) { throw new IllegalStateException("图床配置读取失败，请核对服务端配置与密钥文件"); }
    }
}
