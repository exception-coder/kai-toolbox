import { common } from '@kit.AbilityKit';
import { webview } from '@kit.ArkWeb';
import { picker } from '@kit.CoreFileKit';
import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { abilityAccessCtrl } from '@kit.AbilityKit';
import { camera, cameraPicker } from '@kit.CameraKit';
import { FORGE_ORIGIN, FORGE_PATH, FORGE_PROXY_PERMISSION, isForgeUrl } from '../ForgeConfig';
import { NativeBridge } from '../NativeBridge';

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private context: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;
  private bridge: NativeBridge = new NativeBridge(this.context, this.controller);
  @State private failed: boolean = false;

  onBackPress(): boolean {
    if (this.controller.accessBackward()) { this.controller.backward(); return true; }
    return false;
  }

  private async choose(selector: FileSelectorParam, result: FileSelectorResult): Promise<void> {
    try {
      if (!isForgeUrl(this.controller.getUrl())) { result.handleFileList([]); return; }
      const types = selector.getAcceptType();
      const onlyImages = types.length > 0 && types.every((type: string) => type.startsWith('image/'));
      if (selector.isCapture()) {
        const permission = await abilityAccessCtrl.createAtManager().requestPermissionsFromUser(this.context, ['ohos.permission.CAMERA']);
        if (permission.authResults[0] !== 0) { result.handleFileList([]); return; }
        const captured = await cameraPicker.pick(this.context, [cameraPicker.PickerMediaType.PHOTO], { cameraPosition: camera.CameraPosition.CAMERA_POSITION_BACK });
        result.handleFileList(captured.resultUri ? [captured.resultUri] : []);
      } else if (onlyImages) {
        const options = new photoAccessHelper.PhotoSelectOptions();
        options.MIMEType = photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE;
        options.maxSelectNumber = selector.getMode() === FileSelectorMode.FILE_OPEN_MULTIPLE ? 8 : 1;
        const selected = await new photoAccessHelper.PhotoViewPicker().select(options);
        result.handleFileList(selected.photoUris);
      } else {
        const options = new picker.DocumentSelectOptions();
        options.maxSelectNumber = selector.getMode() === FileSelectorMode.FILE_OPEN_MULTIPLE ? 8 : 1;
        result.handleFileList(await new picker.DocumentViewPicker(this.context).select(options));
      }
    } catch { result.handleFileList([]); }
  }

  build() {
    Column() {
      if (this.failed) {
        Column({ space: 12 }) {
          Text('Forge 暂时无法连接').fontSize(18)
          Text('检查网络或服务状态。原会话、草稿和任务仍在原服务器；重试不会发送新消息。').fontSize(14)
          Button('重新连接').onClick(() => { this.failed = false; this.controller.refresh(); })
          Button('在浏览器打开').onClick(() => { this.context.openLink(FORGE_ORIGIN + FORGE_PATH).catch(() => {}); })
        }.padding(20).width('100%')
      }
      Web({ src: FORGE_ORIGIN + FORGE_PATH, controller: this.controller })
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .fileAccess(false)
        .mixedMode(MixedMode.None)
        .javaScriptProxy({ object: this.bridge, name: 'ForgeNative', methodList: ['postMessage'], controller: this.controller, permission: FORGE_PROXY_PERMISSION })
        .onLoadIntercept((event) => {
          if (!event) { return true; }
          const target = event.data.getRequestUrl();
          if (isForgeUrl(target)) { return false; }
          if (event.data.isMainFrame() && event.data.isRequestGesture() && /^https?:\/\//.test(target)) {
            this.context.openLink(target).catch(() => {});
          }
          return true;
        })
        .onPageBegin(() => { this.failed = false; })
        .onErrorReceive((event) => { if (event?.request.isMainFrame()) { this.failed = true; } })
        .onHttpErrorReceive((event) => { if (event?.request.isMainFrame() && event.response.getResponseCode() >= 400) { this.failed = true; } })
        .onSslErrorEventReceive((event) => { event?.handler.handleCancel(); this.failed = true; })
        .onShowFileSelector((event) => {
          if (!event) { return false; }
          // One request owns exactly one picker, including the capture branch.
          this.choose(event.fileSelector, event.result);
          return true;
        })
        .onPermissionRequest((event) => {
          if (!event) { return; }
          const request = event.request;
          const resources = request.getAccessibleResource();
          if (!isForgeUrl(request.getOrigin()) || resources.length !== 1 || resources[0] !== 'ohos.permission.AUDIO_CAPTURE') {
            request.deny(); return;
          }
          abilityAccessCtrl.createAtManager().requestPermissionsFromUser(this.context, ['ohos.permission.MICROPHONE']).then((result) => {
            if (result.authResults[0] === 0 && isForgeUrl(this.controller.getUrl())) { request.grant(resources); }
            else { request.deny(); }
          }).catch(() => { request.deny(); });
        })
        .layoutWeight(1)
    }.width('100%').height('100%')
  }
}
