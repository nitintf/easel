import { Check, Copy } from 'lucide-react'
import { useMemo, useState } from 'react'

import { selectionToJsx } from '@easel/editor-core'

import { getGraph, useEditorStore } from '../store/editor-store'

import { ScrollArea } from '@/components/ui/scroll-area'

/**
 * Simple regex-based JSX syntax highlighting.
 * Returns an array of {text, className} segments.
 */
function highlightJsx(code: string): { text: string; cls: string }[] {
  const segments: { text: string; cls: string }[] = []
  // Match JSX tokens: tags, props, strings, numbers, text
  const re =
    /(<\/?[A-Z]\w*)|(\s[a-z]\w*=)|("(?:[^"\\]|\\.)*")|(\{[^}]*\})|(\/?>)|(<\/[A-Z]\w*>)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(code)) !== null) {
    // text before this match
    if (match.index > lastIndex) {
      segments.push({ text: code.slice(lastIndex, match.index), cls: 'text-[#ccc]' })
    }
    const m = match[0]
    if (match[1]) {
      // opening/closing tag name like <Frame or </Frame
      segments.push({ text: m, cls: 'text-[#7dd3fc]' })
    } else if (match[2]) {
      // prop name like  w= or  name=
      const eqIdx = m.indexOf('=')
      segments.push({ text: m.slice(0, eqIdx), cls: 'text-[#93c5fd]' })
      segments.push({ text: '=', cls: 'text-[#ccc]' })
    } else if (match[3]) {
      // string value
      segments.push({ text: m, cls: 'text-[#86efac]' })
    } else if (match[4]) {
      // expression in braces
      segments.push({ text: '{', cls: 'text-[#ccc]' })
      segments.push({ text: m.slice(1, -1), cls: 'text-[#fbbf24]' })
      segments.push({ text: '}', cls: 'text-[#ccc]' })
    } else if (match[5]) {
      // /> or >
      segments.push({ text: m, cls: 'text-[#7dd3fc]' })
    } else if (match[6]) {
      // closing tag </Frame>
      segments.push({ text: m, cls: 'text-[#7dd3fc]' })
    }
    lastIndex = match.index + m.length
  }
  // remainder
  if (lastIndex < code.length) {
    segments.push({ text: code.slice(lastIndex), cls: 'text-[#ccc]' })
  }
  return segments
}

export function CodePanel() {
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const sceneVersion = useEditorStore((s) => s.sceneVersion)
  const [copied, setCopied] = useState(false)

  const code = useMemo(() => {
    void sceneVersion
    const graph = getGraph()
    const ids = [...selectedIds]
    if (ids.length === 0) {
      // Show page root children
      const page = graph.getPages()[0]
      if (!page) return ''
      const children = graph.getChildren(page.id)
      if (children.length === 0) return ''
      return selectionToJsx(
        children.map((c) => c.id),
        graph,
      )
    }
    return selectionToJsx(ids, graph)
  }, [selectedIds, sceneVersion])

  const lines = code.split('\n')
  const highlighted = useMemo(() => lines.map((line) => highlightJsx(line)), [code])

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  if (!code) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-center text-[11px] text-[#888]">
        Select an object to see its JSX code
      </div>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Copy button */}
      <button
        className="absolute right-3 top-2 z-10 flex items-center gap-1 rounded-md bg-[#252525] px-2 py-1 text-[10px] text-[#888] transition-colors hover:bg-[#333] hover:text-[#ccc]"
        onClick={() => void copyCode()}
      >
        {copied ? (
          <>
            <Check className="size-3" />
            Copied
          </>
        ) : (
          <>
            <Copy className="size-3" />
            Copy
          </>
        )}
      </button>

      {/* Code block */}
      <ScrollArea className="min-h-0 flex-1">
        <pre className="p-3 font-mono text-[11px] leading-[1.6]">
          {highlighted.map((segs, lineIdx) => (
            <div key={lineIdx} className="flex">
              <span className="mr-3 inline-block w-6 shrink-0 select-none text-right text-[#444]">
                {lineIdx + 1}
              </span>
              <span>
                {segs.map((seg, segIdx) => (
                  <span key={segIdx} className={seg.cls}>
                    {seg.text}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </pre>
      </ScrollArea>
    </div>
  )
}
