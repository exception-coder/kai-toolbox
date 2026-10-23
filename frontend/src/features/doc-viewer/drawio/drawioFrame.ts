export const DRAWIO_ASSET_PATH = '/vendor/drawio/32.5.5/'

/** Isolate the legacy viewer globals and restrict all diagram-initiated network access. */
export function buildDrawioFrame(origin: string, token: string): string {
  const assets = `${origin}${DRAWIO_ASSET_PATH}`
  const csp = `default-src 'none'; script-src ${assets} 'nonce-${token}'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'`
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>html,body,#diagram{width:100%;height:100%;margin:0;overflow:auto}body{font-family:Arial,sans-serif;background:#fff}#diagram{position:relative;box-sizing:border-box}</style>
<script nonce="${token}">
window.PROXY_URL=window.STYLE_PATH=window.SHAPES_PATH=window.STENCIL_PATH=window.DRAW_MATH_URL=window.GRAPH_IMAGE_PATH=window.mxImageBasePath=window.mxBasePath='${assets}';
window.mxLanguage='en';window.mxLoadResources=false;window.mxLoadStylesheets=false;
window.onDrawioViewerLoad=function(){};
</script><script src="${assets}viewer-static.min.js"></script></head>
<body><div id="diagram"></div><script nonce="${token}">
(function(){
var token='${token}', viewer=null, host=${JSON.stringify(origin)};
function report(state){parent.postMessage({type:'forge-drawio',token:token,state:state},host)}
if(!window.GraphViewer||!window.mxStencilRegistry){report('error');return}
mxStencilRegistry.allowEval=false;
Graph.prototype.openLink=function(){};
document.addEventListener('click',function(event){if(event.target.closest?.('a')){event.preventDefault();event.stopPropagation()}},true);
window.addEventListener('message',function(event){
if(event.source!==parent||event.origin!==host||event.data?.token!==token)return;
try{
var data=event.data;
if(data.action==='load'){
if(viewer)viewer.graph.destroy();
var container=document.getElementById('diagram');container.replaceChildren();
container.setAttribute('data-mxgraph',JSON.stringify({xml:data.xml,toolbar:null,lightbox:false,nav:true,'auto-fit':true,'responsive':false,'resize':false,lazy:false}));
GraphViewer.createViewerForElement(container,function(instance){viewer=instance;report('rendered')});
}else if(viewer){
if(data.action==='zoom-in')viewer.graph.zoomIn();
if(data.action==='zoom-out')viewer.graph.zoomOut();
if(data.action==='fit')viewer.fitGraph();
}
}catch(error){console.warn('draw.io preview failed',error);report('error')}
});
report('ready');
})();
</script></body></html>`
}
