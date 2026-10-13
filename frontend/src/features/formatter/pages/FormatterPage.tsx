import { lazy, Suspense, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FormatterTabs, FORMAT_OPTIONS, type FormatTab } from '../components/FormatterTabs'
import { JsonPanel } from '../components/JsonPanel'
import { NginxPanel } from '../components/NginxPanel'
import { XmlPanel } from '../components/XmlPanel'
import { YamlPanel } from '../components/YamlPanel'
import { SqlPanel } from '../components/SqlPanel'

const JavaCodePanel = lazy(() => import('../components/java/JavaCodePanel').then(module => ({ default: module.JavaCodePanel })))
const PANELS = { json: JsonPanel, xml: XmlPanel, yaml: YamlPanel, sql: SqlPanel, nginx: NginxPanel }
const TAB_HINTS: Record<FormatTab, string> = {
  java: '直接粘贴完整 Java 文件、方法或语句片段，高亮查看并格式化副本。代码仅留在浏览器。',
  json: '美化 / 压缩 / 转义反转义；解析失败会标出错误位置',
  xml: '美化 / 压缩 / 转义反转义；基于 xml-formatter，宽松模式可兼容轻量错误',
  yaml: '美化 / 压缩（flow 样式） / YAML ↔ JSON 互转；互转会丢注释与锚点',
  sql: '多方言（MySQL / PostgreSQL / SQLite / SQL Server 等）+ 关键字大小写控制',
  nginx: '基于 token 的简易格式化器，支持缩进 + 压缩，注释 / 引号字符串保留',
}

export function FormatterPage({ embedded = false, active = true }: { embedded?: boolean; active?: boolean } = {}) {
  const location = useLocation()
  const navigate = useNavigate()
  const requested = new URLSearchParams(location.search).get('format')
  const tab = FORMAT_OPTIONS.find(option => option.value === requested)?.value ?? 'json'
  const [visited, setVisited] = useState<FormatTab[]>([])
  useEffect(() => { setVisited(previous => previous.includes(tab) ? previous : [...previous, tab]) }, [tab])
  const select = (value: FormatTab) => {
    setVisited(previous => previous.includes(tab) ? previous : [...previous, tab])
    const query = new URLSearchParams(location.search)
    query.set('format', value)
    navigate({ pathname: location.pathname, search: `?${query}`, hash: location.hash }, { replace: true })
  }

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${tab === 'java' ? 'gap-3' : 'gap-4'} ${embedded ? '' : 'h-full p-6'}`}>
      <header className={tab === 'java' ? 'shrink-0 space-y-2' : 'shrink-0 space-y-3'}>
        <h1 className={embedded ? 'sr-only' : 'text-xl font-semibold tracking-tight'}>格式化工具</h1>
        <FormatterTabs value={tab} onChange={select} />
        <p className="text-xs text-[var(--color-muted-foreground)]">{TAB_HINTS[tab]}{tab !== 'java' && '；纯前端运算，输入不会上送服务端。'}</p>
      </header>
      {FORMAT_OPTIONS.map(option => {
        const selected = tab === option.value
        const Panel = option.value === 'java' ? null : PANELS[option.value]
        return <section key={option.value} role="tabpanel" id={`format-panel-${option.value}`} aria-labelledby={`format-tab-${option.value}`}
          hidden={!selected} className={selected && option.value === 'java' ? 'flex min-h-0 min-w-0 flex-1 flex-col' : 'min-w-0'}>
          {(selected || visited.includes(option.value)) && (Panel ? <Panel /> : <Suspense fallback={<p role="status">正在加载 Java 代码视图…</p>}>
            <JavaCodePanel active={active && selected} />
          </Suspense>)}
        </section>
      })}
    </div>
  )
}
