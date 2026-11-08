package com.exceptioncoder.toolbox.docviewer.imagehost;

import com.exceptioncoder.toolbox.common.resource.ResourceCredentialCipher;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.web.server.ResponseStatusException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import static com.exceptioncoder.toolbox.docviewer.imagehost.ImageHostModels.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ImageHostServiceTest {
    SingleConnectionDataSource data;
    JdbcTemplate jdbc;
    ImageHostRepository repository;
    ImageHostService service;
    ImageUploadGateway gateway;
    ImageHostPolicy policy;
    ObjectMapper mapper = new ObjectMapper();
    byte[] png = {(byte)137,80,78,71,13,10,26,10,0};
    Settings github = new Settings("团队图片","GITHUB","","","","docs","","team/images","main",false);

    @BeforeEach void setup() {
        data = new SingleConnectionDataSource("jdbc:sqlite::memory:",true);
        new ResourceDatabasePopulator(new ClassPathResource("db/doc-image-host-schema.sql")).execute(data);
        jdbc = new JdbcTemplate(data);
        Map<String,String> envelopes = new HashMap<>();
        var cipher = mock(ResourceCredentialCipher.class);
        when(cipher.encrypt(anyString())).thenAnswer(call -> { String envelope="encrypted:"+UUID.randomUUID(); envelopes.put(envelope,call.getArgument(0)); return envelope; });
        when(cipher.decrypt(anyString())).thenAnswer(call -> envelopes.get(call.getArgument(0)));
        repository = new ImageHostRepository(jdbc,mapper,cipher);
        policy = new ImageHostPolicy(""); gateway = mock(ImageUploadGateway.class);
        service = new ImageHostService(repository,policy,gateway);
    }
    @AfterEach void close() { data.destroy(); }
    View create(long owner) { return service.save(owner,null,new SaveRequest(github,"","example-private-token",true,UUID.randomUUID().toString())); }

    @Test void credentialsAreEncryptedAndNeverReturnedAndEmptyEditPreservesThem() throws Exception {
        var saved = create(1);
        assertFalse(mapper.writeValueAsString(saved).contains("example-private-token"));
        assertFalse(jdbc.queryForObject("SELECT credentials FROM doc_image_host",String.class).contains("example-private-token"));
        service.save(1,saved.id(),new SaveRequest(github,"","",false,null));
        assertEquals("example-private-token",repository.find(1,saved.id()).orElseThrow().credentials().secret());
        assertFalse(new SaveRequest(github,"key","secret",true,null).toString().contains("secret,"));
    }
    @Test void ownerCannotReadModifyDeleteOrUploadAnotherOwnersProfile() {
        var p = create(1);
        assertTrue(service.list(2).isEmpty());
        assertThrows(ResponseStatusException.class, () -> service.save(2,p.id(),new SaveRequest(github,"","other",false,null)));
        assertThrows(ResponseStatusException.class, () -> service.delete(2,p.id()));
        assertThrows(ResponseStatusException.class, () -> service.upload(2,p.id(),UUID.randomUUID().toString(),"screen.png",png));
        assertEquals(1,service.list(1).size()); verifyNoInteractions(gateway);
    }
    @Test void saveDoesNotUploadAndDefaultMovesOnlyWithinTheOwner() {
        var first = create(1); create(2);
        var second = service.save(1,null,new SaveRequest(github,"","other-token",true,UUID.randomUUID().toString()));
        assertFalse(repository.find(1,first.id()).orElseThrow().isDefault());
        assertTrue(repository.find(1,second.id()).orElseThrow().isDefault());
        assertTrue(service.list(2).getFirst().isDefault()); verifyNoInteractions(gateway);
        service.delete(1,second.id()); assertTrue(service.list(1).getFirst().isDefault());
    }
    @Test void uploadReceiptIsStableAndSameIdNeverUploadsTwice() throws Exception {
        var p=create(1); String id=UUID.randomUUID().toString();
        var r=service.upload(1,p.id(),id,"diagram](bad).png",png);
        assertEquals("SUCCESS",r.state()); assertTrue(r.url().startsWith("https://raw.githubusercontent.com/team/images/main/docs/"));
        assertTrue(r.objectKey().endsWith(id+".png")); assertFalse(r.getMarkdown().contains("diagram](bad)"));
        assertEquals(r,service.upload(1,p.id(),id,"another-name.png",png));
        verify(gateway,times(1)).upload(any(),anyString(),any(),eq("image/png"));
        byte[] changed=png.clone(); changed[8]=1;
        assertThrows(ResponseStatusException.class,()->service.upload(1,p.id(),id,"new.png",changed));
        assertTrue(service.recent(2).isEmpty());
    }
    @Test void uncertainProviderResultDoesNotLeakSecretsOrReplay() throws Exception {
        var p=create(1); String id=UUID.randomUUID().toString();
        doThrow(new IllegalStateException("example-private-token upstream https://signed.invalid/?secret=value")).when(gateway).upload(any(),anyString(),any(),anyString());
        var failure=assertThrows(ResponseStatusException.class,()->service.upload(1,p.id(),id,"x.png",png));
        assertFalse(failure.getMessage().contains("example-private-token"));
        assertEquals("UNKNOWN",service.recent(1).getFirst().state());
        assertThrows(ResponseStatusException.class,()->service.upload(1,p.id(),id,"x.png",png));
        verify(gateway,times(1)).upload(any(),anyString(),any(),anyString());
    }
    @Test void rejectsInvalidImagesSizeAndRequestIdsBeforeExternalCalls() {
        var p=create(1);
        assertThrows(ResponseStatusException.class,()->service.upload(1,p.id(),"bad","x.png",png));
        assertThrows(ResponseStatusException.class,()->service.upload(1,p.id(),UUID.randomUUID().toString(),"pretend.png","<svg/>".getBytes()));
        assertThrows(ResponseStatusException.class,()->service.upload(1,p.id(),UUID.randomUUID().toString(),"huge.png",new byte[ImageHostService.MAX_BYTES+1]));
        verifyNoInteractions(gateway); assertTrue(service.recent(1).isEmpty());
    }
    @Test void providerChangeRequiresNewCredentialsAndUnsafeUrlsAreRejected() {
        var p=create(1);
        Settings s3 = new Settings("s3","S3","https://s3.example.com","auto","docs","images","https://images.example.com","","",true);
        assertThrows(ResponseStatusException.class,()->service.save(1,p.id(),new SaveRequest(s3,"","",false,null)));
        assertThrows(ResponseStatusException.class,()->ImageHostPolicy.https("https://user:pass@example.com"));
        assertThrows(ResponseStatusException.class,()->ImageHostPolicy.https("https://example.com/?token=secret"));
        assertThrows(ResponseStatusException.class,()->policy.validate(new Settings("unsafe","OSS","https://attacker.invalid","cn-hangzhou","docs","","https://images.example.com","","",false)));
        assertThrows(ResponseStatusException.class,()->policy.validate(new Settings("unsafe","GITHUB","","","","../escape","","team/images","main",false)));
    }
    @Test void rejectsPrivateUploadHostsUnlessExplicitlyConfiguredOnServer() {
        Settings local = new Settings("internal","S3","https://127.0.0.1","auto","docs","","https://images.example.com","","",true);
        assertThrows(ResponseStatusException.class,()->policy.checkUploadTarget(local));
        assertDoesNotThrow(()->new ImageHostPolicy("127.0.0.1").checkUploadTarget(local));
        assertThrows(ResponseStatusException.class,()->policy.checkUploadTarget(new Settings("custom","S3","https://arbitrary.example.com","auto","docs","","https://images.example.com","","",true)));
        assertDoesNotThrow(()->new ImageHostPolicy("storage.example.com").checkUploadTarget(new Settings("custom","S3","https://storage.example.com:9000","auto","docs","","https://images.example.com","","",true)));
        assertThrows(ResponseStatusException.class,()->policy.checkUploadTarget(new Settings("internal","S3","https://169.254.169.254","auto","docs","","https://images.example.com","","",true)));
    }
    @Test void createRetriesReuseAnOwnerBoundIdentityWithoutCreatingDuplicates() {
        String request=UUID.randomUUID().toString();
        var payload=new SaveRequest(github,"","fixture-token",true,request);
        var first=service.save(1,null,payload);
        var retry=service.save(1,null,payload);
        assertEquals(first.id(),retry.id()); assertEquals(1,service.list(1).size());
        assertNotEquals(first.id(),service.save(2,null,payload).id());
        assertThrows(ResponseStatusException.class,()->service.save(1,null,new SaveRequest(github,"","fixture-token",true,"invalid")));
    }
}
