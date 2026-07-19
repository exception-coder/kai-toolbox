export interface DesignTokenResponse {
  version: string
  theme: Record<string, unknown>
}

export interface VersionInfo {
  version: string
  createdAt: string | null
  summary: string | null
  isActive: boolean
}

export interface VersionsResponse {
  versions: VersionInfo[]
}

export interface SampleInfo {
  id: string
  name: string
}

export interface SamplesResponse {
  samples: SampleInfo[]
}
