import { useEditorStore } from "../../store/editor-store";
import { ColorInput } from "../ui/color-input";

import type { Color } from "@easel/editor-core";

export function PageSection() {
  const pageColor = useEditorStore((s) => s.pageColor);
  const actions = useEditorStore((s) => s.actions);

  function updateColor(color: Color) {
    useEditorStore.setState({ pageColor: color });
    actions.requestRender();
  }

  return (
    <div className="border-b border-[#2a2a2a] px-3 py-2.5">
      <label className="mb-2 block text-[10px] font-medium uppercase tracking-wide text-[#888]">Page</label>
      <ColorInput editable color={pageColor} onUpdate={updateColor} />
    </div>
  );
}
