import type { DatasourceType } from './types'

/** 各中间件类型的展示元数据。 */
export const TYPE_META: Record<DatasourceType, { label: string; badge: string; queryable: boolean }> = {
  MYSQL: { label: 'MySQL', badge: 'bg-sky-500/15 text-sky-600 dark:text-sky-300', queryable: true },
  ORACLE: { label: 'Oracle', badge: 'bg-red-500/15 text-red-600 dark:text-red-300', queryable: true },
  REDIS: { label: 'Redis', badge: 'bg-rose-500/15 text-rose-600 dark:text-rose-300', queryable: true },
  RABBITMQ: { label: 'RabbitMQ', badge: 'bg-orange-500/15 text-orange-600 dark:text-orange-300', queryable: false },
  KAFKA: { label: 'Kafka', badge: 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300', queryable: false },
}

export const TYPE_OPTIONS: DatasourceType[] = ['MYSQL', 'ORACLE', 'REDIS', 'RABBITMQ', 'KAFKA']

/** 默认端口，选类型时自动填。 */
export const TYPE_DEFAULT_PORT: Record<DatasourceType, number> = {
  MYSQL: 3306,
  ORACLE: 1521,
  REDIS: 6379,
  RABBITMQ: 5672,
  KAFKA: 9092,
}

/** 常用环境（可自定义输入）。 */
export const ENV_PRESETS = ['DEV', 'TEST', 'UAT', 'PROD']

/** 环境色板，用于分组标识。 */
export function envBadge(env: string): string {
  switch (env.toUpperCase()) {
    case 'PROD': return 'bg-red-500/15 text-red-600 dark:text-red-300'
    case 'UAT': return 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
    case 'TEST': return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
    case 'DEV': return 'bg-sky-500/15 text-sky-600 dark:text-sky-300'
    default: return 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300'
  }
}
