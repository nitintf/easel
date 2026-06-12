import { useMemo } from 'react'

import { getGraph, useEditorStore } from '../store/editor-store'

import { AppearanceSection } from './properties/appearance-section'
import { CollapsibleSection } from './properties/collapsible-section'
import { EffectsSection } from './properties/effects-section'
import { ExportSection } from './properties/export-section'
import { FillSection } from './properties/fill-section'
import { LayoutSection } from './properties/layout-section'
import { PageSection } from './properties/page-section'
import { PositionSection } from './properties/position-section'
import { StrokeSection } from './properties/stroke-section'
import { TypographySection } from './properties/typography-section'

export function DesignPanel() {
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const sceneVersion = useEditorStore((s) => s.sceneVersion)
  const actions = useEditorStore((s) => s.actions)

  const nodes = useMemo(() => {
    void sceneVersion
    return [...selectedIds]
      .map((id) => getGraph().getNode(id))
      .filter((n): n is NonNullable<typeof n> => !!n)
  }, [selectedIds, sceneVersion])

  const node = nodes[0] ?? null
  const multiCount = nodes.length
  const isComponentType = node?.type === 'COMPONENT' || node?.type === 'COMPONENT_SET' || node?.type === 'INSTANCE'

  // Multi-select summary
  if (multiCount > 1) {
    return (
      <div className="pb-4">
        <div className="flex items-center gap-1.5 border-b border-[#2a2a2a] px-3 py-2.5">
          <span className="text-[10px] text-[#888]">Mixed</span>
          <span className="text-[11px] font-semibold text-[#ccc]">{multiCount} layers</span>
        </div>
        <PositionSection />
        <AppearanceSection />
        <FillSection />
        <StrokeSection />
      </div>
    )
  }

  // Single selection
  if (node) {
    return (
      <div className="pb-4">
        {/* Node header */}
        <div className="flex items-center gap-1.5 border-b border-[#2a2a2a] px-3 py-2.5">
          <span className={`text-[10px] ${isComponentType ? 'text-[#9747ff]' : 'text-[#888]'}`}>
            {node.type}
          </span>
          <span className="text-[11px] font-semibold text-[#ccc]">{node.name}</span>
        </div>

        {/* Instance actions */}
        {node.type === 'INSTANCE' && (
          <div className="flex flex-col gap-1.5 border-b border-[#2a2a2a] px-3 py-2.5">
            <button
              className="rounded bg-[#9747ff]/10 px-2 py-1 text-left text-[10px] text-[#9747ff] hover:bg-[#9747ff]/20"
              onClick={() => actions.goToMainComponent()}
            >
              Go to Main Component
            </button>
            <button
              className="rounded px-2 py-1 text-left text-[10px] text-[#666] hover:bg-[#3a3a3a]"
              onClick={() => actions.detachInstance()}
            >
              Detach Instance
            </button>
          </div>
        )}

        <CollapsibleSection id="position" label="Position">
          <PositionSection />
        </CollapsibleSection>
        <CollapsibleSection id="layout" label="Layout">
          <LayoutSection />
        </CollapsibleSection>
        <CollapsibleSection id="appearance" label="Appearance">
          <AppearanceSection />
        </CollapsibleSection>
        {node.type === 'TEXT' && (
          <CollapsibleSection id="typography" label="Typography">
            <TypographySection />
          </CollapsibleSection>
        )}
        <CollapsibleSection id="fill" label="Fill">
          <FillSection />
        </CollapsibleSection>
        <CollapsibleSection id="stroke" label="Stroke">
          <StrokeSection />
        </CollapsibleSection>
        <CollapsibleSection id="effects" label="Effects">
          <EffectsSection />
        </CollapsibleSection>
        <CollapsibleSection id="export" label="Export">
          <ExportSection />
        </CollapsibleSection>
      </div>
    )
  }

  // No selection — page properties
  return (
    <div className="pb-4">
      <PageSection />
    </div>
  )
}
