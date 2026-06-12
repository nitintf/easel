import { Code, PanelRightClose } from 'lucide-react'
import { useState } from 'react'

import { useEditorStore } from '../store/editor-store'

import { CodePanel } from './code-panel'
import { DesignPanel } from './design-panel'

import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type Tab = 'design' | 'code'

export function PropertiesPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('design')

  const tabClass = (tab: Tab) =>
    `cursor-pointer rounded px-2 py-1 text-[10px] transition-colors ${
      activeTab === tab
        ? 'font-semibold text-[#ccc]'
        : 'text-[#888] hover:text-[#999]'
    }`

  return (
    <aside aria-label="Properties" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#191919]">
      {/* Header with tabs + minimize */}
      <div className="flex h-9 shrink-0 items-center border-b border-[#2a2a2a]">
        <div className="flex min-w-0 flex-1 items-center gap-0.5 px-2">
          <button className={tabClass('design')} onClick={() => setActiveTab('design')}>
            Design
          </button>
          <button
            className={`flex items-center gap-1 ${tabClass('code')}`}
            onClick={() => setActiveTab('code')}
          >
            <Code className="size-3" />
            Code
          </button>
        </div>

        <div className="flex shrink-0 items-center pr-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="flex size-6 items-center justify-center rounded-md text-[#888] transition-colors hover:bg-[#2a2a2a] hover:text-[#999]"
                onClick={() => useEditorStore.setState({ showRightPanel: false })}
              >
                <PanelRightClose className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" sideOffset={4}>
              Close panel
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'design' ? (
        <ScrollArea className="min-h-0 flex-1">
          <DesignPanel />
        </ScrollArea>
      ) : (
        <CodePanel />
      )}
    </aside>
  )
}
