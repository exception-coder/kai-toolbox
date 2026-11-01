import { installDrawioViewport } from './drawioViewport'

export const DRAWIO_ASSET_PATH = '/vendor/drawio/32.5.5/'

/** Isolate the legacy viewer globals and restrict all diagram-initiated network access. */
export function buildDrawioFrame(origin: string, token: string): string {
  const assets = `${origin}${DRAWIO_ASSET_PATH}`
  const csp = `default-src 'none'; script-src ${assets} 'nonce-${token}'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'`
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{width:100%;height:100%;margin:0;overflow:hidden}body{font-family:Arial,sans-serif;background:#fff}#diagram{position:relative;box-sizing:border-box;width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;overflow:hidden!important;overscroll-behavior:contain;touch-action:pan-y pinch-zoom}</style>
<script nonce="${token}">
window.PROXY_URL=window.STYLE_PATH=window.SHAPES_PATH=window.STENCIL_PATH=window.DRAW_MATH_URL=window.GRAPH_IMAGE_PATH=window.mxImageBasePath=window.mxBasePath='${assets}';
window.mxLanguage='en';window.mxLoadResources=false;window.mxLoadStylesheets=false;
window.onDrawioViewerLoad=function(){};
</script><script src="${assets}viewer-static.min.js"></script></head>
<body><div id="diagram"></div><script nonce="${token}">
(function(){
var token='${token}',host=${JSON.stringify(origin)};
(${installDrawioViewport.toString()})(host,token);
})();
</script></body></html>`
}
