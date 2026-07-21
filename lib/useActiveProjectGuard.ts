import { useEffect } from 'react';
import { useArchitectStore } from '@/store/useArchitectStore';
import { v4 as uuidv4 } from 'uuid';

export function useActiveProjectGuard() {
  const activeProjectId = useArchitectStore(state => state.activeProjectId);
  const switchSession = useArchitectStore(state => state.switchSession);
  const activeProject = useArchitectStore(state => state.activeProject);

  useEffect(() => {
    if (!activeProjectId) {
      const newSessionId = uuidv4();
      const defaultName = `Untitled Project — ${new Date().toLocaleString()}`;
      switchSession(newSessionId, defaultName, 'Unknown Location');

      // Prompt for a name via custom HUD modal
      const requestProjectName = async () => {
        const showHUDModal = useArchitectStore.getState().showHUDModal;
        const userEnteredName = await showHUDModal({
          type: 'prompt',
          title: 'PROJECT CORRIDOR INITIALIZATION',
          message: 'You landed on a generation screen without an active project.\nPlease enter a name to initialize your project:',
          defaultValue: defaultName
        });
        const finalName = userEnteredName && userEnteredName.trim() ? userEnteredName.trim() : defaultName;

        // Update the active project name in the store
        useArchitectStore.setState((state) => {
          if (state.activeProject) {
            return {
              projectName: finalName,
              activeProject: {
                ...state.activeProject,
                name: finalName,
                updatedAt: Date.now()
              }
            };
          }
          return {};
        });
      };

      requestProjectName();
    }
  }, [activeProjectId, switchSession]);

  return { activeProjectId, activeProject };
}
