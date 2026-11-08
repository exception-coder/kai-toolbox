package com.exceptioncoder.toolbox.docviewer.imagehost;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.concurrent.atomic.AtomicReference;
import static com.exceptioncoder.toolbox.docviewer.imagehost.ImageHostModels.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class OfficialImageUploadGatewayTest {
    @Test void officialS3AndOssSdksSendConditionalImagePutsToConfiguredTarget() throws Exception {
        for (String provider : new String[]{"S3","OSS"}) {
            var method = new AtomicReference<String>(); var contentType = new AtomicReference<String>();
            var noOverwrite = new AtomicReference<String>(); var payloadSize = new AtomicReference<Integer>();
            // An ephemeral loopback fixture exercises the real SDK without cloud accounts or external writes.
            var server = HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
            server.createContext("/", exchange -> {
                method.set(exchange.getRequestMethod()); contentType.set(exchange.getRequestHeaders().getFirst("Content-Type"));
                noOverwrite.set(exchange.getRequestHeaders().getFirst(provider.equals("S3") ? "If-None-Match" : "x-oss-forbid-overwrite"));
                payloadSize.set(exchange.getRequestBody().readAllBytes().length);
                exchange.getResponseHeaders().add("ETag","\"098f6bcd4621d373cade4e832627b4f6\"");
                exchange.getResponseHeaders().add("x-oss-request-id","fixture-request");
                exchange.sendResponseHeaders(200,-1); exchange.close();
            });
            server.start();
            try {
                var settings = new Settings("fixture",provider,"http://127.0.0.1:"+server.getAddress().getPort(),"us-east-1","images","","https://images.example.com","","",true);
                new OfficialImageUploadGateway(new ObjectMapper()).upload(new Stored("test",1,settings,new Credentials("fixture-key","fixture-secret"),true),"docs/image.png",new byte[]{1,2,3},"image/png");
                assertEquals("PUT",method.get()); assertEquals("image/png",contentType.get());
                assertEquals(provider.equals("S3") ? "*" : "true",noOverwrite.get()); assertEquals(3,payloadSize.get());
            } finally { server.stop(0); }
        }
    }
    @Test void githubUsesFixedApiHostAndRejectsNonCreatedWithoutFollowingLinks() throws Exception {
        var client=mock(HttpClient.class); var response=mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(201);
        doReturn(response).when(client).send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class));
        var gateway=new OfficialImageUploadGateway(new ObjectMapper(),client);
        var settings=new Settings("github","GITHUB","","","","","","team/images","main",false);
        var profile=new Stored("test",1,settings,new Credentials("","fixture-token"),true);
        gateway.upload(profile,"docs/image.png",new byte[]{1},"image/png");
        var request=ArgumentCaptor.forClass(HttpRequest.class);
        verify(client).send(request.capture(),any(HttpResponse.BodyHandler.class));
        assertEquals("api.github.com",request.getValue().uri().getHost());
        assertEquals("/repos/team/images/contents/docs/image.png",request.getValue().uri().getPath());
        assertFalse(request.getValue().uri().toString().contains("fixture-token"));
        assertEquals("Bearer fixture-token",request.getValue().headers().firstValue("Authorization").orElseThrow());
        when(response.statusCode()).thenReturn(302);
        assertThrows(IllegalStateException.class,()->gateway.upload(profile,"docs/image.png",new byte[]{1},"image/png"));
    }
}
