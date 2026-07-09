/**
 * 手势识别的 WASM / 模型来源解析（hook 与调试面板共用同一套，保证一致）。
 * 均支持 localStorage 覆盖，便于境内改指到本机 / 代理 / 镜像而无需重新构建。
 */

/** WASM：jsdelivr 境内一般可达；localStorage 'kai-toolbox:gesture-wasm-url' 覆盖。 */
export function gestureWasmUrl(): string {
  return localStorage.getItem('kai-toolbox:gesture-wasm-url')
    || 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
}

/**
 * 模型候选（按序尝试，第一个成功即用）：
 *   1) localStorage 'kai-toolbox:gesture-model-url' 覆盖
 *   2) 本机 public 自备：frontend/public/mediapipe/gesture_recognizer.task（境内首选，离线可用）
 *   3) google storage 官方（境内常被墙）
 */
export function gestureModelUrls(): string[] {
  return [
    localStorage.getItem('kai-toolbox:gesture-model-url') || '',
    `${import.meta.env.BASE_URL}mediapipe/gesture_recognizer.task`,
    'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
  ].filter(Boolean)
}
