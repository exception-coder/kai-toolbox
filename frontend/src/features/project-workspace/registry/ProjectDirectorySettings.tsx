import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getConfigBlock, PROJECT_DIRECTORY_BLOCKS } from '@/features/config-center/public-api'
import { RegistryError } from './RegistryStates'
import { directoriesUnified, unifiedDirectoryBlock, DIRECTORY_SECTIONS, type DirectorySection } from './directorySettingsModel'
import { ProjectDirectoryEditor } from './ProjectDirectoryEditor'
import { ProjectCatalogSettings } from './ProjectCatalogSettings'

export { directoryValues } from './directorySettingsModel'

export function ProjectDirectorySettings() {
  return <section className="max-w-3xl space-y-8">
    <div>
      <h2 className="font-semibold">项目目录</h2>
      <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">在这里统一管理项目来源与扫描规则。仅扫描各目录的一级子目录；保存不会搬移文件或删除已登记系统。</p>
    </div>
    <DirectoryBlock section={DIRECTORY_SECTIONS[0]} />
    <ProjectCatalogSettings />
    <details><summary className="cursor-pointer text-sm text-[var(--color-muted-foreground)]">托管源码高级设置</summary><div className="mt-4"><DirectoryBlock section={DIRECTORY_SECTIONS[1]} /></div></details>
  </section>
}

function DirectoryBlock({ section }: { section: DirectorySection }) {
  const [saved, setSaved] = useState(false)
  const query = useQuery({ queryKey: ['config-block', section.id], queryFn: () => getConfigBlock(section.id) })
  const needsLegacy = section.id === PROJECT_DIRECTORY_BLOCKS.workspace && Boolean(query.data) && !directoriesUnified(query.data!)
  const legacy = useQuery({ queryKey: ['config-block', PROJECT_DIRECTORY_BLOCKS.projects], queryFn: () => getConfigBlock(PROJECT_DIRECTORY_BLOCKS.projects), enabled: needsLegacy })
  const block = query.data && (!needsLegacy || legacy.data) ? needsLegacy ? unifiedDirectoryBlock(query.data, legacy.data!) : query.data : null
  return <div className="space-y-3 border-t border-[var(--color-border)] pt-5">
    {query.isError && <p className="text-sm font-medium">暂时无法读取{section.title}</p>}
    <RegistryError error={query.error} retry={() => void query.refetch()} />
    {needsLegacy && <RegistryError error={legacy.error} retry={() => void legacy.refetch()} />}
    {needsLegacy && legacy.isLoading && <p role="status" className="text-sm">正在合并原有项目目录…</p>}
    {query.isLoading && <p role="status" className="text-sm">正在读取{section.title}…</p>}
    {saved && <p role="status" className="text-sm">{section.title}已保存，项目列表将按扫描缓存周期刷新。</p>}
    {block && <ProjectDirectoryEditor key={JSON.stringify(block)} block={block} section={section}
      onSaved={() => setSaved(true)} onEdit={() => setSaved(false)} />}
  </div>
}
