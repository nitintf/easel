import { useEffect, useState } from "react";

import { useChatStore } from "@/features/chat/store/chat-store";
import { useEditorStore } from "@/features/editor/store/editor-store";
import { getPreference } from "@/lib/api/preferences";

export function useAppInit(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function init() {
      // Restore UI preferences
      const leftSidebarOpen = await getPreference("leftSidebarOpen", true);
      const rightPanelOpen = await getPreference("rightPanelOpen", true);

      useEditorStore.setState({
        showUI: leftSidebarOpen,
        showRightPanel: rightPanelOpen,
      });

      // Initialize chat preferences (model, agent count)
      await useChatStore.getState().actions.initializePreferences();

      setReady(true);
    }

    void init();
  }, []);

  return ready;
}
