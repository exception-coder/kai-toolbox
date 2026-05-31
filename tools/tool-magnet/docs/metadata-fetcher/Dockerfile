FROM python:3.12-slim

WORKDIR /app

# magnet2torrent: 纯 Python BT metadata fetcher (BEP-9 实现)
# aiohttp: 异步 HTTP 服务
RUN pip install --no-cache-dir --root-user-action=ignore \
        magnet2torrent==1.1.1 \
        aiohttp==3.9.5

COPY app.py .

EXPOSE 9000

# -u: stdout 不缓冲,docker logs 实时能看
CMD ["python", "-u", "app.py"]
