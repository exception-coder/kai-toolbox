"""Python 3.11+ protocol example, not a separate SDK. Lock websockets in your project.

Does not retry business input or disable TLS validation. Real-account networking is not verified here.
"""
import asyncio
import json
import os
import sys
import urllib.parse
import urllib.request
import uuid
from websockets.asyncio.client import connect


def get_ticket(base, token):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None  # Never forward credentials to a redirected host.
    request = urllib.request.Request(base + "/api/fore-consult/client/tickets", data=b"", method="POST",
        headers={"Authorization": "Bearer " + token})
    with urllib.request.build_opener(NoRedirect).open(request, timeout=20) as response:
        return json.load(response)


async def main():
    base = os.environ["FORGE_BASE_URL"].rstrip("/")
    origin = urllib.parse.urlsplit(base)
    if origin.scheme != "https" or origin.username or origin.password or origin.path or origin.query or origin.fragment:
        raise ValueError("FORGE_BASE_URL 必须是无路径和凭据的 HTTPS Origin")
    ticket = await asyncio.to_thread(get_ticket, base, os.environ["FORGE_ACCESS_TOKEN"])
    if ticket["websocketPath"] != "/api/fore-consult/client/ws":
        raise ValueError("连接路径不兼容")
    request_id = os.environ.get("FORGE_REQUEST_ID", str(uuid.uuid4()))
    print("请保存 requestId 和完整输入：", request_id, file=sys.stderr)
    async with asyncio.timeout(600):
        async with connect("wss://" + origin.netloc + ticket["websocketPath"], open_timeout=20, max_size=1024*1024) as ws:
            await ws.send(json.dumps({"type": "auth", "ticket": ticket["ticket"]}))
            auth = json.loads(await ws.recv())
            if auth.get("type") != "authenticated" or auth.get("protocolVersion") != "1.0":
                raise RuntimeError("连接认证或协议校验失败")
            await ws.send(json.dumps({"type": "consult.ask", "requestId": request_id,
                "consultationId": os.environ.get("FORGE_CONSULTATION_ID"),
                "question": sys.argv[1] if len(sys.argv) > 1 else "如何查看采购订单审核状态？"}))
            async for raw in ws:
                event = json.loads(raw)
                if event["type"] == "accepted":
                    print("咨询已登记：", event["consultationId"], file=sys.stderr)
                elif event["type"] == "answer.delta":
                    print(event.get("text", ""), end="", flush=True)
                elif event["type"] == "error":
                    raise RuntimeError(event.get("code", "REQUEST_FAILED"))
                elif event["type"] == "completed" and event.get("requestId") == request_id:
                    print("\n终态：", event.get("stopReason"))
                    return


if __name__ == "__main__":
    asyncio.run(main())
