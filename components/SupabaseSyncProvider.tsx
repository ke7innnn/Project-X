'use client';

import { useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/lib/supabase';
import { useArchitectStore } from '@/store/useArchitectStore';

export default function SupabaseSyncProvider({ children }: { children: React.ReactNode }) {
  const syncTimeout = useRef<NodeJS.Timeout | null>(null);
  
  const sessionId = useArchitectStore(state => state.sessionId);
  const isRestored = useArchitectStore(state => state.isRestored);

  // 1. Initial Load & Session Switching
  useEffect(() => {
    const initSession = async () => {
      let activeSessionId = sessionId;
      
      // If no session ID in store, load from localStorage or create new
      if (!activeSessionId) {
        activeSessionId = localStorage.getItem('architect_session_id') || '';
        if (!activeSessionId) {
          activeSessionId = uuidv4();
          localStorage.setItem('architect_session_id', activeSessionId);
        }
        useArchitectStore.getState().setSessionId(activeSessionId);
        return; // The setSessionId will trigger a re-run of this effect
      }

      // If we've already restored this session, do nothing
      if (isRestored) return;

      // Fetch existing state from Supabase
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('state')
          .eq('session_id', activeSessionId)
          .single();

        if (error && error.code !== 'PGRST116') {
          // PGRST116 is the "no rows returned" error, which is fine for a new session
          console.error("Error fetching session from Supabase:", error);
        }

        if (data && data.state) {
          // Restore state
          const restoredState = data.state;
          // Omit volatile UI states
          delete restoredState.isLoading;
          delete restoredState.loadingMessage;
          delete restoredState.isAppStarted;
          delete restoredState.isRestored;
          
          // Self-healing guard for corrupted phase state
          if (!restoredState.currentFloorPlan) {
            if (['generate', 'measure', 'edit', 'export'].includes(restoredState.phase)) {
              console.log(`[SupabaseSyncProvider] Healing phase from '${restoredState.phase}' to '${restoredState.selectedNatureImage ? 'concept' : 'search'}' because currentFloorPlan is null.`);
              restoredState.phase = restoredState.selectedNatureImage ? 'concept' : 'search';
            }
          }
          if (!restoredState.selectedNatureImage) {
            if (restoredState.phase !== 'search') {
              console.log(`[SupabaseSyncProvider] Healing phase from '${restoredState.phase}' to 'search' because selectedNatureImage is null.`);
              restoredState.phase = 'search';
            }
          }
          
          useArchitectStore.getState().replaceState(restoredState);
        }
      } catch (err) {
        console.error("Failed to restore session from Supabase", err);
      } finally {
        useArchitectStore.getState().setIsRestored(true);
      }
    };

    initSession();
  }, [sessionId, isRestored]);

  // 2. Syncing to Supabase
  useEffect(() => {
    const unsubscribe = useArchitectStore.subscribe((state, prevState) => {
      // Don't sync until initial restore is complete
      if (!state.isRestored || !state.sessionId) return;

      if (syncTimeout.current) {
        clearTimeout(syncTimeout.current);
      }

      syncTimeout.current = setTimeout(async () => {
        try {
          // Don't persist volatile UI state
          const { isLoading, loadingMessage, isRestored, isAppStarted, ...stateToSave } = state;

          const { error } = await supabase
            .from('projects')
            .upsert({ 
              session_id: state.sessionId,
              state: stateToSave
            }, { onConflict: 'session_id' });

          if (error) {
            console.error("Failed to sync to Supabase:", error);
          }
        } catch (err) {
          console.error("Error syncing to Supabase", err);
        }
      }, 2000); // 2 second debounce
    });

    return () => {
      unsubscribe();
      if (syncTimeout.current) clearTimeout(syncTimeout.current);
    };
  }, []);

  return <>{children}</>;
}
