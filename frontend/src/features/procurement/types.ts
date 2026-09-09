export interface Site { id: string; name: string; host: string; enabled: boolean; listUrl: string; notes: string }
export type RuleCategory = 'KEYWORD' | 'NEGATIVE' | 'CONTEXT' | 'DICTIONARY'
export interface Rule { id: string; category: RuleCategory; name: string; enabled: boolean; fields: Record<string, string> }
export interface Notice {
  id: string; siteId: string; url: string; title: string; captureStatus: string; parseStatus: string;
  rawText: string; finalUrl: string; frameUrl: string; httpStatus: number | null; capturedAt: string | null;
  error: string; candidates: string; analysis: string; sourceData: string; runId: string | null; updateTime: string;
}
export interface Run {
  id: string; status: string; total: number; processed: number; succeeded: number; failed: number;
  error: string; createTime: string; updateTime: string;
}
export interface NoticePage { items: Notice[]; total: number; page: number; pageSize: number }
export interface Overview { sites: number; notices: number; captured: number; failed: number; rules: number; review: number }
export const categoryNames: Record<RuleCategory, string> = {
  KEYWORD: '解析关键词', NEGATIVE: '反向关键词', CONTEXT: '共现与解析', DICTIONARY: '分类字典',
}
export const statusNames: Record<string, string> = {
  PENDING: '待采集', SUCCESS: '已采集', FAILED: '采集失败', CANDIDATES_ONLY: '候选待解析',
  MANUAL_CHECK: '待人工核验', PARSED: '已解析', RUNNING: '采集中', COMPLETED: '采集完成',
  PARTIAL: '部分失败', INTERRUPTED: '已中断',
}
export const dateText = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '尚未采集'
