import { common } from '@kit.AbilityKit';
import { pasteboard } from '@kit.BasicServicesKit';
import { util } from '@kit.ArkTS';
import { fileIo, fileUri } from '@kit.CoreFileKit';
import { image } from '@kit.ImageKit';
import { systemShare } from '@kit.ShareKit';
import { uniformTypeDescriptor } from '@kit.ArkData';
import { webview } from '@kit.ArkWeb';
import { isForgeUrl } from './ForgeConfig';

interface PngPayload { name?: string; data: string }
interface NativePayload { text?: string; data?: string; images?: PngPayload[] }
interface NativeRequest { id: string; version: number; method: string; payload: NativePayload }
interface NativeResult { status?: string; version?: number; platform?: string; methods?: string[] }
interface NativeReply { id: string; ok: boolean; result?: NativeResult; error?: string }

/** The proxy permission restricts calling frames; the controller URL is independently checked per call. */
export class NativeBridge {
  private context: common.UIAbilityContext;
  private controller: webview.WebviewController;
  private busy: boolean = false;
  private replies: Map<string, string> = new Map<string, string>();

  constructor(context: common.UIAbilityContext, controller: webview.WebviewController) {
    this.context = context; this.controller = controller;
  }

  private imageCache(): string {
    const cache = this.context.cacheDir + '/forge-images';
    if (!fileIo.accessSync(cache)) { fileIo.mkdirSync(cache); }
    const expiry = Date.now() - 24 * 60 * 60 * 1000;
    const names = fileIo.listFileSync(cache);
    for (const name of names) {
      if (/^\d{13}-[a-f0-9-]+\.png$/.test(name) && Number(name.split('-')[0]) < expiry) {
        fileIo.unlinkSync(cache + '/' + name);
      }
    }
    if (fileIo.listFileSync(cache).length >= 64) { throw new Error('Native cache is full'); }
    return cache;
  }

  postMessage(raw: string): void {
    if (!isForgeUrl(this.controller.getUrl()) || raw.length > 24 * 1024 * 1024) { return; }
    let request: NativeRequest;
    try {
      request = JSON.parse(raw) as NativeRequest;
      if (request.version !== 1 || !/^[a-zA-Z0-9-]{1,64}$/.test(request.id)) { return; }
    } catch { return; }
    const cached = this.replies.get(request.id);
    if (cached !== undefined) { this.deliver(cached); return; }
    if (this.busy) { this.reply({ id: request.id, ok: false, error: '请先完成当前手机操作' }); return; }
    this.busy = true;
    this.execute(request).then((result: NativeResult) => {
      this.reply({ id: request.id, ok: true, result: result });
    }).catch(() => {
      this.reply({ id: request.id, ok: false, error: '手机操作未完成，请检查权限或重新选择' });
    }).finally(() => { this.busy = false; });
  }

  private deliver(json: string): void {
    if (!isForgeUrl(this.controller.getUrl())) { return; }
    // json is serialized data; never accept an executable script from the page.
    this.controller.runJavaScript(`window.dispatchEvent(new CustomEvent('forge-native-result',{detail:${json}}))`).catch(() => {});
  }

  private reply(reply: NativeReply): void {
    const json = JSON.stringify(reply);
    this.replies.set(reply.id, json);
    if (this.replies.size > 64) {
      const first = this.replies.keys().next();
      if (!first.done) { this.replies.delete(first.value); }
    }
    this.deliver(json);
  }

  private async png(data: string): Promise<ArrayBuffer> {
    if (!data || data.length > 11184820) { throw new Error('PNG exceeds 8MB'); }
    const bytes = new util.Base64Helper().decodeSync(data);
    const signature: number[] = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.length < 8 || bytes.length > 8 * 1024 * 1024) { throw new Error('Invalid PNG'); }
    for (let i = 0; i < signature.length; i++) {
      if (bytes[i] !== signature[i]) { throw new Error('Invalid PNG signature'); }
    }
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const source = image.createImageSource(buffer);
    try {
      const info = await source.getImageInfo();
      if (info.size.width * info.size.height > 40000000) { throw new Error('PNG dimensions exceeded'); }
    } finally { await source.release(); }
    return buffer;
  }

  private async execute(request: NativeRequest): Promise<NativeResult> {
    if (request.method === 'capabilities') {
      return { version: 1, platform: 'harmony', methods: ['copyText', 'copyImage', 'shareImages'] };
    }
    if (request.method === 'copyText') {
      if (typeof request.payload.text !== 'string' || request.payload.text.length > 1000000) { throw new Error('Invalid text'); }
      await pasteboard.getSystemPasteboard().setData(pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, request.payload.text));
      return { status: 'copied' };
    }
    if (request.method === 'copyImage') {
      const buffer = await this.png(request.payload.data ?? '');
      const source = image.createImageSource(buffer);
      const pixels = await source.createPixelMap();
      try {
        await pasteboard.getSystemPasteboard().setData(pasteboard.createData(pasteboard.MIMETYPE_PIXELMAP, pixels));
      } finally { await pixels.release(); await source.release(); }
      return { status: 'copied' };
    }
    if (request.method === 'shareImages') {
      const images = request.payload.images;
      if (!images || images.length < 1 || images.length > 8) { throw new Error('Invalid image count'); }
      const cache = this.imageCache();
      if (fileIo.listFileSync(cache).length + images.length > 64) { throw new Error('Native cache limit exceeded'); }
      const uris: string[] = [];
      for (let i = 0; i < images.length; i++) {
        const data = await this.png(images[i].data);
        const path = cache + '/' + Date.now().toString() + '-' + util.generateRandomUUID() + '.png';
        const file = fileIo.openSync(path, fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
        try { fileIo.writeSync(file.fd, data); } finally { fileIo.closeSync(file); }
        uris.push(fileUri.getUriFromPath(path));
      }
      const shared = new systemShare.SharedData({ utd: uniformTypeDescriptor.UniformDataType.PNG, uri: uris[0], title: 'Forge 卡片' });
      for (let i = 1; i < uris.length; i++) {
        shared.addRecord({ utd: uniformTypeDescriptor.UniformDataType.PNG, uri: uris[i], title: 'Forge 卡片' });
      }
      const controller = new systemShare.ShareController(shared);
      await controller.show(this.context, { selectionMode: systemShare.SelectionMode.BATCH, previewMode: systemShare.SharePreviewMode.DETAIL });
      return { status: 'handed-off' };
    }
    throw new Error('Unsupported mobile method');
  }
}
