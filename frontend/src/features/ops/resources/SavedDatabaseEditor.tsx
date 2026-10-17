import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listDatasources, testDatasource, updateDatasource } from '../api'
import { DatasourceEditor } from '../components/DatasourceEditor'
import type { DatasourcePayload, DatasourceView } from '../types'

/** 编辑原数据源，不读取明文密码，不建立咨询专属连接副本。 */
export function SavedDatabaseEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const client = useQueryClient()
  const sources = useQuery({ queryKey: ['ops', 'datasources'], queryFn: () => listDatasources() })
  const [draft, setDraft] = useState<DatasourcePayload | null>(null)
  const save = useMutation({ mutationFn: (value: DatasourcePayload) => updateDatasource(id, value), onSuccess: saved => {
    client.setQueryData<DatasourceView[]>(['ops', 'datasources'], previous => previous?.map(item => item.id === saved.id ? saved : item))
    setDraft(null)
    for (const queryKey of [['ops', 'datasources'], ['system-resources'], ['consult-database-configuration'], ['agent-management', 'consult-resources']]) {
      void client.invalidateQueries({ queryKey })
    }
  } })
  const test = useMutation({ mutationFn: () => testDatasource(id) })
  const source = sources.data?.find(value => value.id === id)
  const value: DatasourcePayload | null = draft ?? (source ? {
    systemId: source.systemId, type: source.type, env: source.env, name: source.name, host: source.host, port: source.port,
    username: source.username ?? '', password: '', dbName: source.dbName ?? '', params: source.params ?? '', note: source.note ?? '', sortOrder: source.sortOrder,
  } : null)
  return <section aria-label="编辑原数据库连接" className="space-y-3 border-t py-3">
    <h4 className="font-medium">编辑原数据库连接</h4>
    <p className="text-xs leading-5 text-muted-foreground">保存直接修改原连接，影响所有引用它的系统及已有咨询的后续查询。密码留空保持原值；测试只使用已保存配置。</p>
    {sources.isPending && <p role="status">正在读取连接…</p>}
    {sources.isError && <p role="alert">连接读取失败。<button onClick={() => void sources.refetch()} className="min-h-11 underline">重试</button></p>}
    {sources.isSuccess && !source && <p role="alert">原连接已不存在，请刷新关联列表。</p>}
    {value && <fieldset disabled={save.isPending || test.isPending || !sources.isSuccess} className="min-w-0">
      <DatasourceEditor value={value} editing saving={save.isPending} testing={test.isPending} testDisabled={!!draft || test.isPending || !sources.isSuccess}
        testResult={test.data ?? null} onChange={next => { setDraft(next); save.reset(); test.reset() }}
        onCancel={onClose} onSave={() => { if (sources.isSuccess) save.mutate(value) }} onTest={() => test.mutate()} />
    </fieldset>}
    {(save.isError || test.isError) && <p role="alert" className="text-xs text-destructive">{save.isError ? '保存失败，草稿已保留。' : '连接测试请求失败。'}请核对当前状态后重试。</p>}
    {save.isSuccess && <p role="status" className="text-xs">原连接已保存，后续查询使用更新后的配置；这不代表已测试连通。</p>}
    {(!value || sources.isError) && <button onClick={onClose} className="min-h-11 underline">关闭连接编辑</button>}
  </section>
}
