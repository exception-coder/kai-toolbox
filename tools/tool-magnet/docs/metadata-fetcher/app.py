"""
metadata-fetcher: 小型 HTTP 服务,接 GET /metadata/<infohash> 返回 .torrent 字节。

部署在能畅通访问 DHT 的机器上(比如 170.106.186.65),
toolbox 本机 resolver 调用它拿元数据,然后本地 aria2 真正下载文件 — 把
"需要好网络的 metadata 拉取" 和 "需要大带宽的文件下载" 解耦。

依赖: aiohttp, magnet2torrent
"""
import asyncio
import logging
import os
import re
from aiohttp import web
from magnet2torrent import Magnet2Torrent, FailedToFetchException

INFOHASH_RE = re.compile(r'^[0-9a-fA-F]{40}$')
FETCH_TIMEOUT = int(os.environ.get('FETCH_TIMEOUT', '60'))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(name)s %(message)s',
)
log = logging.getLogger('metadata-fetcher')


async def health(_request):
    return web.json_response({'ok': True})


async def get_metadata(request):
    raw = request.match_info['hash']
    info_hash = raw.upper()
    if not INFOHASH_RE.match(info_hash):
        return web.Response(status=400, text=f'invalid infohash: {raw}')

    magnet = f'magnet:?xt=urn:btih:{info_hash}'
    log.info('fetching %s (timeout=%ds)', info_hash, FETCH_TIMEOUT)

    m2t = Magnet2Torrent(magnet, timeout=FETCH_TIMEOUT)
    try:
        filename, content = await m2t.retrieve_torrent()
        log.info('HIT %s -> %s (%d bytes)', info_hash, filename, len(content))
        return web.Response(
            body=content,
            content_type='application/x-bittorrent',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"',
                'Cache-Control': 'public, max-age=86400',
            },
        )
    except FailedToFetchException as e:
        log.warning('MISS %s: %s', info_hash, e)
        return web.Response(status=404, text=f'no metadata: {e}')
    except asyncio.TimeoutError:
        log.warning('TIMEOUT %s', info_hash)
        return web.Response(status=504, text='timeout')
    except Exception as e:
        log.error('ERROR %s: %r', info_hash, e)
        return web.Response(status=500, text=str(e))


app = web.Application()
app.router.add_get('/health', health)
app.router.add_get('/metadata/{hash}', get_metadata)


if __name__ == '__main__':
    web.run_app(
        app,
        host=os.environ.get('LISTEN_HOST', '0.0.0.0'),
        port=int(os.environ.get('LISTEN_PORT', '9000')),
    )
