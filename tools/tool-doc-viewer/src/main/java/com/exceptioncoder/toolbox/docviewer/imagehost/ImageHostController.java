package com.exceptioncoder.toolbox.docviewer.imagehost;

import com.exceptioncoder.toolbox.common.auth.AuthException;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.forge.annotation.RequiresPermission;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.util.List;
import static com.exceptioncoder.toolbox.docviewer.imagehost.ImageHostModels.*;

@RestController
@RequireAuth
@RequiresPermission("menu:content-tools")
@RequestMapping("/api/doc-viewer/image-hosts")
public class ImageHostController {
    private final ImageHostService service;
    public ImageHostController(ImageHostService service) { this.service = service; }
    private long owner() { return AuthContext.current().orElseThrow(AuthException::tokenInvalid).userId(); }
    @GetMapping public List<View> list() { return service.list(owner()); }
    @PostMapping public View create(@RequestBody SaveRequest input) { return service.save(owner(),null,input); }
    @PutMapping("/{id}") public View update(@PathVariable String id, @RequestBody SaveRequest input) { return service.save(owner(),id,input); }
    @DeleteMapping("/{id}") public void delete(@PathVariable String id) { service.delete(owner(),id); }
    @GetMapping("/uploads") public List<Receipt> recent() { return service.recent(owner()); }
    @PostMapping("/{id}/uploads") public Receipt upload(@PathVariable String id, @RequestParam String requestId,
            @RequestPart("file") MultipartFile file) throws IOException {
        if (file.getSize() > ImageHostService.MAX_BYTES) ImageHostPolicy.bad("请选择10MiB以内的图片");
        try (var stream = file.getInputStream()) {
            return service.upload(owner(),id,requestId,file.getOriginalFilename(),stream.readNBytes(ImageHostService.MAX_BYTES + 1));
        }
    }
}
