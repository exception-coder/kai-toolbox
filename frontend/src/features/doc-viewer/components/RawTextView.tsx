interface RawTextViewProps {
  content: string
}

export function RawTextView({ content }: RawTextViewProps) {
  return (
    <pre className="doc-viewer-raw whitespace-pre-wrap break-words rounded-md bg-[var(--color-muted)]/40 p-4 text-xs text-[var(--color-foreground)]">
      {content}
    </pre>
  )
}
