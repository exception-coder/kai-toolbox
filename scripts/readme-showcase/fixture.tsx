import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfirmProvider } from "../../frontend/src/components/ui/confirm-dialog";
import { ChatPage } from "../../frontend/src/features/claude-chat/pages/ChatPage";
import { MessageMarkdownDialog } from "../../frontend/src/features/claude-chat/components/messages/MessageMarkdownDialog";
import { SessionAutopilotStatus } from "../../frontend/src/features/claude-chat/components/SessionAutopilotStatus";
const query = new URLSearchParams(location.search);
const route = query.get("view") ? "/tools/claude-chat?view=" + query.get("view") : "/tools/claude-chat";
const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
createRoot(document.getElementById("root")).render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[route]}><ConfirmProvider><div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}><div style={{ height: 28, flexShrink: 0, background: "#16161e", borderBottom: "1px solid #363b54", color: "#a9b1d6", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", letterSpacing: ".02em" }}><span>FORGE · VIBE CODING</span><span>公开演示数据 · 离线组件预览</span></div>{query.has("planning") && <SessionAutopilotStatus sessionId="showcase-orders" projectRoot="/workspace/demo/demo-shop" onOpenDashboard={() => {
}} />}<ChatPage />{query.has("document") && <MessageMarkdownDialog sessionId="showcase-orders" path="/workspace/demo/demo-shop/docs/复核说明.md" onClose={() => {
}} returnFocus={() => {
}} />}</div></ConfirmProvider></MemoryRouter></QueryClientProvider>);
