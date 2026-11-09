import { ArrowUp, Check, Copy, Mic, MoreHorizontal, Plus, Square, X } from 'lucide-react'
import { workbenchThemeStyle, type WorkbenchTheme } from '../lib/workbenchTheme'
import { skinFamily } from '../lib/artisticSkins'
import { AssistantReply } from './messages/AssistantReply'
import { ToolCallBubble } from './ToolCallBubble'

const sample = '### 应用配置优化方案\n\n让内容与操作各有位置，保留清楚的阅读顺序。\n\n- 搜索条件与按钮水平对齐\n- 数据表格使用剩余空间\n\n```ts\nconst layout = {\n  navigation: "project",\n  content: "conversation"\n}\n```'

/** 完整场景作为视觉基准；大图复用真实渲染器，缩略图不挂载高亮/工具订阅。 */
export function WorkbenchSkinScene({ theme, strength, thumbnail = false, grayscale = false }: {
  theme: WorkbenchTheme; strength: number; thumbnail?: boolean; grayscale?: boolean
}) {
  const family = skinFamily(theme)?.id
  return <div className={`wb-skin-scene ${thumbnail ? 'wb-skin-thumbnail' : ''} ${grayscale ? 'wb-scene-grayscale' : ''}`}
    data-workbench-theme={theme === 'inherit' ? undefined : theme} data-skin-family={family}
    style={workbenchThemeStyle(theme, strength)} aria-hidden={thumbnail || undefined}>
    <div className="wb-scene-header"><strong>{family === 'press' ? 'FORGE / EDITORIAL' : family === 'terminal' ? 'forge / workspace >_' : 'Forge / workspace'}</strong><span>{thumbnail ? '设计预览' : '外观预览 · 演示数据'}</span></div>
    <div className="wb-scene-messages">
      <div className="wb-scene-user">优化配置页面，并说明关键方案。</div>
      <div className="wb-scene-author">Codex <span>09:41</span></div>
      {thumbnail ? <>
        <div className="wb-assistant-reply"><h3>应用配置优化方案</h3><p>搜索与操作对齐，让数据成为主体。</p>
          <div className="wb-code-block"><div className="wb-code-header"><span>TS</span><Copy size={10} /></div><pre><span>const</span> layout = {'{'}<br />{'  '}content: <b>"conversation"</b><br />{'}'}</pre></div>
        </div>
        <div className="wb-tool-call" data-agent-state="completed"><Check size={11} /> 已读取 workspace.ts</div>
      </> : <><AssistantReply text={sample} /><ToolCallBubble toolName="Read" input={{ file: 'src/workspace.ts' }} output="已读取示例文件；未执行真实任务。" /></>}
      <div className="wb-scene-footer" aria-hidden="true"><Copy /><span>复制</span><MoreHorizontal /></div>
      <div className="wb-scene-panel"><div><strong>会话控制 · 面板示例</strong><X aria-hidden="true" size={12} /></div><p>待发送消息 · 2 条</p><span>任务结束后发送</span></div>
    </div>
    <div className="wb-scene-status" data-execution-state="running"><div><span className="wb-scene-status-light" /><strong>Codex 正在运行</strong><span className="wb-scene-control">会话控制 ↑</span><Square size={12} /><span>停止</span></div></div>
    <div className="wb-scene-input-area"><div className="mobile-composer-card wb-scene-composer"><Plus aria-hidden="true" /><span>{family === 'terminal' ? 'forge > 输入消息…' : '继续提出你的需求…'}</span><Mic aria-hidden="true" /><span className="wb-scene-send"><ArrowUp aria-hidden="true" /></span></div></div>
  </div>
}
