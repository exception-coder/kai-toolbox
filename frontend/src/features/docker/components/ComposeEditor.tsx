import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import CodeMirror from '@uiw/react-codemirror'
import { keymap } from '@codemirror/view'
import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { yaml } from '@codemirror/lang-yaml'
import { json } from '@codemirror/lang-json'
import { File, FilePlus, Save } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useIsDarkTheme } from '@/lib/useIsDarkTheme'
import { ApiError } from '@/lib/api'
import { listFiles, readFile, writeFile } from '../api'

interface Props {
  hostId: string
  appId: string
  baseDir: string
}

const cmFontTheme = EditorView.theme({
  '&': { fontSize: '12px' },
  '.cm-content': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
})

function pickLang(filename: string): Extension[] {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.json')) return [json()]
  if (/\.(ya?ml)$/.test(lower) || /(docker-)?compose\.ya?ml$/.test(lower)) return [yaml()]
  return []
}

const DEFAULT_COMPOSE_TEMPLATE = `services:
  app:
    image: nginx:alpine
    container_name: app
    restart: unless-stopped
    ports:
      - "8080:80"
    # volumes:
    #   - ./data:/data
    # environment:
    #   - KEY=value
`

const DEFAULT_ENV_TEMPLATE = `# 用 KEY=VALUE 形式声明，每行一条
`

function templateFor(filename: string): string {
  const lower = filename.toLowerCase()
  if (/^(docker-)?compose\.ya?ml$/.test(lower)) return DEFAULT_COMPOSE_TEMPLATE
  if (lower === '.env' || lower.endsWith('.env') || lower.startsWith('.env.')) return DEFAULT_ENV_TEMPLATE
  return ''
}

export function ComposeEditor({ hostId, appId, baseDir }: Props) {
  const qc = useQueryClient()
  const dark = useIsDarkTheme()
  const [picked, setPicked] = useState<string | null>(null)
  // isDraft = picked 是即将新建的文件路径，readFile 不可用，保存时落到远端创建新文件
  const [isDraft, setIsDraft] = useState(false)
  const [content, setContent] = useState<string>('')
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedHint, setSavedHint] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('docker-compose.yml')

  const filesQuery = useQuery({
    queryKey: ['docker', 'files', hostId, appId],
    queryFn: () => listFiles(hostId, appId),
  })
  const files = filesQuery.data ?? []

  useEffect(() => {
    if (!picked && files.length > 0 && !isDraft) {
      const compose = files.find(f => /^(docker-)?compose\.ya?ml$/i.test(f.name))
      setPicked((compose ?? files[0]).path)
    }
  }, [files, picked, isDraft])

  const fileQuery = useQuery({
    queryKey: ['docker', 'file', hostId, appId, picked],
    queryFn: () => readFile(hostId, appId, picked!),
    enabled: !!picked && !isDraft, // draft 不查后端
  })

  useEffect(() => {
    if (fileQuery.data && !isDraft) {
      setContent(fileQuery.data.content)
      setDirty(false)
      setError(null)
    }
  }, [fileQuery.data, isDraft])

  const saveMutation = useMutation({
    mutationFn: () => writeFile(hostId, appId, picked!, content),
    onSuccess: data => {
      setDirty(false)
      setIsDraft(false)
      setSavedHint(
        data.backupPath
          ? `已保存，备份：${data.backupPath}`
          : '已保存',
      )
      qc.invalidateQueries({ queryKey: ['docker', 'files', hostId, appId] })
      setTimeout(() => setSavedHint(null), 4000)
    },
    onError: e => setError(toMsg(e)),
  })

  function selectFile(path: string) {
    if (dirty && !confirm('当前文件未保存，切换会丢失改动，确认？')) return
    setIsDraft(false)
    setPicked(path)
    setDirty(false)
    setError(null)
  }

  function startCreate() {
    setError(null)
    setCreating(true)
    setDraftName(files.some(f => /^(docker-)?compose\.ya?ml$/i.test(f.name))
      ? 'docker-compose.override.yml'
      : 'docker-compose.yml')
  }

  function confirmCreate() {
    const name = draftName.trim()
    if (!name) {
      setError('文件名不能为空')
      return
    }
    if (name.includes('/') || name.includes('\\') || name.startsWith('.') && name.length === 1) {
      setError('文件名不能包含 / 或 \\')
      return
    }
    const newPath = baseDir.endsWith('/') ? baseDir + name : baseDir + '/' + name
    if (files.some(f => f.path === newPath)) {
      if (!confirm(`远端已存在 ${name}，是否切换到该文件编辑而非新建？`)) return
      setCreating(false)
      selectFile(newPath)
      return
    }
    if (dirty && !confirm('当前文件未保存，新建会丢失改动，确认？')) return
    setCreating(false)
    setIsDraft(true)
    setPicked(newPath)
    setContent(templateFor(name))
    setDirty(true) // 立即可保存
    setError(null)
  }

  const extensions = useMemo<Extension[]>(() => {
    const exts: Extension[] = [
      cmFontTheme,
      EditorView.lineWrapping,
      keymap.of([
        {
          key: 'Mod-s',
          run: () => {
            if (picked && dirty && !saveMutation.isPending) saveMutation.mutate()
            return true
          },
        },
      ]),
    ]
    if (picked) exts.push(...pickLang(picked))
    return exts
  }, [picked, dirty, saveMutation])

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <File className="size-4" /> 配置文件
          {isDraft && <Badge variant="secondary" className="text-[10px]">新建中</Badge>}
          {dirty && !isDraft && <Badge variant="secondary" className="text-[10px]">未保存</Badge>}
        </CardTitle>
        <div className="flex items-center gap-2">
          {savedHint && <span className="text-[11px] text-green-600">{savedHint}</span>}
          <Button size="sm" disabled={!picked || !dirty || saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}>
            <Save className="size-3.5" />
            {saveMutation.isPending ? '保存中…' : '保存 (Ctrl+S)'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {error && (
          <div className="mb-2 text-xs text-red-500 border border-red-300 rounded px-2 py-1">{error}</div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-3 min-h-[400px]">
          <div className="border rounded p-1 flex flex-col gap-0.5 max-h-[520px] overflow-auto">
            {creating ? (
              <div className="flex flex-col gap-1.5 p-1.5 border-b">
                <Input
                  autoFocus
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') confirmCreate()
                    if (e.key === 'Escape') setCreating(false)
                  }}
                  placeholder="文件名，如 docker-compose.yml"
                  className="h-7 text-xs"
                />
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]"
                          onClick={() => setCreating(false)}>取消</Button>
                  <Button size="sm" className="h-6 px-2 text-[11px]"
                          onClick={confirmCreate}>创建</Button>
                </div>
              </div>
            ) : (
              <button
                onClick={startCreate}
                className="text-left px-2 py-1.5 rounded text-xs text-primary hover:bg-[var(--color-accent)]/50 flex items-center gap-1.5">
                <FilePlus className="size-3.5" />
                新建文件
              </button>
            )}

            {filesQuery.isLoading && (
              <div className="text-xs text-muted-foreground p-2">加载文件列表…</div>
            )}
            {files.length === 0 && !filesQuery.isLoading && !isDraft && (
              <div className="text-xs text-muted-foreground p-2">
                应用目录下无白名单文件，点上方「新建文件」起一个
              </div>
            )}

            {isDraft && picked && (
              <button
                onClick={() => {}}
                className="text-left px-2 py-1 rounded text-xs bg-[var(--color-accent)] font-medium flex items-center gap-1.5">
                <FilePlus className="size-3 opacity-60" />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{picked.split('/').pop()}</div>
                  <div className="text-[10px] text-muted-foreground">未保存</div>
                </div>
              </button>
            )}

            {files.map(f => (
              <button
                key={f.path}
                onClick={() => selectFile(f.path)}
                className={`text-left px-2 py-1 rounded text-xs ${picked === f.path && !isDraft ? 'bg-[var(--color-accent)] font-medium' : 'hover:bg-[var(--color-accent)]/50'}`}>
                <div className="truncate">{f.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {(f.sizeBytes / 1024).toFixed(1)} KB
                </div>
              </button>
            ))}
          </div>

          <div className="border rounded overflow-hidden">
            {picked ? (
              <CodeMirror
                value={content}
                extensions={extensions}
                theme={dark ? 'dark' : 'light'}
                height="500px"
                onChange={value => {
                  setContent(value)
                  setDirty(true)
                }}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLine: false,
                  autocompletion: false,
                  bracketMatching: true,
                  indentOnInput: false,
                }}
              />
            ) : (
              <div className="h-[500px] flex items-center justify-center text-xs text-muted-foreground">
                请在左侧选择文件，或点「新建文件」
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function toMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return String(e)
}
