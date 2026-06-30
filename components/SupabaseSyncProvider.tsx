'use client';

import { useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/lib/supabase';
import { useArchitectStore } from '@/store/useArchitectStore';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: strip large base64 blobs from state before persisting to Supabase.
// Supabase has a ~2MB row limit. A single generated floor plan image is ~500KB–1MB
// in base64. Once we have 2–3 generated options + chat history we blow the limit.
// Solution: save image data to a SEPARATE 'project_images' table keyed by session_id,
// and only save tiny metadata in the main 'projects' state row.
// ─────────────────────────────────────────────────────────────────────────────

/** Strip base64 blobs from conversationHistory messages to keep state row small */
function stripConversationBlobs(history: any[]): any[] {
  if (!Array.isArray(history)) return [];
  return history.map(msg => {
    if (!msg.customType) return msg;
    // floorplan-drafts: strip large base64 option arrays — keep only type + text
    if (msg.customType === 'floorplan-drafts') {
      return { ...msg, customData: { options: [] } };
    }
    // floorplan-edit: strip the edited floorplan blob
    if (msg.customType === 'floorplan-edit') {
      return { ...msg, customData: { instruction: msg.customData?.instruction || '' } };
    }
    // uploaded-image: strip raw base64
    if (msg.customType === 'uploaded-image') {
      return { ...msg, customData: { description: msg.customData?.description || '' } };
    }
    // selected-image: keep the URL metadata (it's small), drop anything large
    return msg;
  });
}

/** Build a lean state object safe to save in the main projects row */
function buildLeanState(state: any): any {
  const {
    // Volatile UI — never persist
    isLoading, loadingMessage, isRestored, isAppStarted,
    // Large blobs — save separately in project_images table
    currentFloorPlan, previousFloorPlan, finalRender,
    generatedOptions, lastUploadedImage,
    renderHistory,
    // Keep everything else
    ...rest
  } = state;

  return {
    ...rest,
    // Strip blobs from conversationHistory
    conversationHistory: stripConversationBlobs(rest.conversationHistory || []),
    // Save a flag so we know images exist (restored separately)
    hasFloorPlan: !!currentFloorPlan,
    hasFinalRender: !!finalRender,
    generatedOptionsCount: Array.isArray(generatedOptions) ? generatedOptions.length : 0,
  };
}

/** Save large blobs separately in project_images table */
async function saveImages(sessionId: string, state: any) {
  const images: Record<string, string | null> = {
    currentFloorPlan: state.currentFloorPlan || null,
    finalRender: state.finalRender || null,
  };

  // Also save generatedOptions as JSON array of base64 strings
  const genOptions = Array.isArray(state.generatedOptions) ? state.generatedOptions : [];

  try {
    await supabase.from('project_images').upsert({
      session_id: sessionId,
      current_floor_plan: images.currentFloorPlan,
      final_render: images.finalRender,
      generated_options: genOptions,
      render_history: Array.isArray(state.renderHistory) ? state.renderHistory : [],
      last_uploaded_image: state.lastUploadedImage || null,
    }, { onConflict: 'session_id' });
  } catch (err) {
    // project_images table might not exist yet — non-fatal
    console.warn('[SupabaseSyncProvider] saveImages failed (table may not exist):', err);
  }
}

/** Restore images from project_images table and merge back into state */
async function restoreImages(sessionId: string): Promise<Partial<any>> {
  try {
    const { data, error } = await supabase
      .from('project_images')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (error || !data) return {};

    return {
      currentFloorPlan: data.current_floor_plan || null,
      finalRender: data.final_render || null,
      generatedOptions: data.generated_options || [],
      renderHistory: data.render_history || [],
      lastUploadedImage: data.last_uploaded_image || null,
    };
  } catch (err) {
    console.warn('[SupabaseSyncProvider] restoreImages failed:', err);
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export default function SupabaseSyncProvider({ children }: { children: React.ReactNode }) {
  const syncTimeout = useRef<NodeJS.Timeout | null>(null);
  const imageSyncTimeout = useRef<NodeJS.Timeout | null>(null);

  const sessionId = useArchitectStore(state => state.sessionId);
  const isRestored = useArchitectStore(state => state.isRestored);

  // ── 1. Initial Load & Session Switching ─────────────────────────────────────
  useEffect(() => {
    const initSession = async () => {
      let activeSessionId = sessionId;

      // If no session ID in store, do not attempt to sync
      if (!activeSessionId) {
        return; 
      }

      // If we've already restored this session, do nothing
      if (isRestored) return;

      try {
        // Fetch lean state from main projects table
        const { data, error } = await supabase
          .from('projects')
          .select('state')
          .eq('session_id', activeSessionId)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('[SupabaseSyncProvider] Error fetching session:', error);
        }

        if (data?.state) {
          const restoredState = { ...data.state };

          // Remove volatile keys
          delete restoredState.isLoading;
          delete restoredState.loadingMessage;
          delete restoredState.isAppStarted;
          delete restoredState.isRestored;

          // Self-healing phase guard
          if (!restoredState.hasFloorPlan) {
            if (['generate', 'measure', 'edit', 'export'].includes(restoredState.phase)) {
              restoredState.phase = restoredState.selectedNatureImage ? 'concept' : 'search';
            }
          }
          if (!restoredState.selectedNatureImage) {
            if (restoredState.phase !== 'search') {
              restoredState.phase = 'search';
            }
          }

          useArchitectStore.getState().replaceState(restoredState);

          // Restore images (separate table) and merge in
          const imageState = await restoreImages(activeSessionId);
          if (Object.keys(imageState).length > 0) {
            const history = [...(restoredState.conversationHistory || [])];
            
            if (imageState.generatedOptions && imageState.generatedOptions.length > 0) {
              const lastDraftIdx = history.findLastIndex(msg => msg.customType === 'floorplan-drafts');
              if (lastDraftIdx !== -1) {
                history[lastDraftIdx] = {
                  ...history[lastDraftIdx],
                  customData: { ...history[lastDraftIdx].customData, options: imageState.generatedOptions }
                };
              }
            }
            
            if (imageState.lastUploadedImage) {
              const lastUploadIdx = history.findLastIndex(msg => msg.customType === 'uploaded-image');
              if (lastUploadIdx !== -1) {
                history[lastUploadIdx] = {
                  ...history[lastUploadIdx],
                  customData: { ...history[lastUploadIdx].customData, base64: imageState.lastUploadedImage }
                };
              }
            }
            
            if (imageState.currentFloorPlan) {
              const lastEditIdx = history.findLastIndex(msg => msg.customType === 'floorplan-edit');
              if (lastEditIdx !== -1) {
                history[lastEditIdx] = {
                  ...history[lastEditIdx],
                  customData: { ...history[lastEditIdx].customData, editedFloorPlan: imageState.currentFloorPlan }
                };
              }
            }

            useArchitectStore.getState().replaceState({ ...imageState, conversationHistory: history });
          }
        }
      } catch (err) {
        console.error('[SupabaseSyncProvider] Failed to restore session:', err);
      } finally {
        useArchitectStore.getState().setIsRestored(true);
      }
    };

    initSession();
  }, [sessionId, isRestored]);



  // ── 2. Syncing to Supabase ───────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = useArchitectStore.subscribe((state) => {
      if (!state.isRestored || !state.sessionId) return;

      // ── Debounced lean state save (500ms) ────────────────────────────────────
      if (syncTimeout.current) clearTimeout(syncTimeout.current);
      syncTimeout.current = setTimeout(async () => {
        try {
          const leanState = buildLeanState(state);

          const { error } = await supabase
            .from('projects')
            .upsert({
              session_id: state.sessionId,
              project_name: state.projectName,
              place_name: state.placeName,
              state: leanState,
            }, { onConflict: 'session_id' });

          if (error) {
            console.error('[SupabaseSyncProvider] Failed to sync lean state:', error);
          }
        } catch (err) {
          console.error('[SupabaseSyncProvider] Sync error:', err);
        }
      }, 1000);

      // ── Debounced image save (3s — these are large blobs) ───────────────────
      if (imageSyncTimeout.current) clearTimeout(imageSyncTimeout.current);
      imageSyncTimeout.current = setTimeout(async () => {
        await saveImages(state.sessionId!, state);
      }, 3000);
    });

    return () => {
      unsubscribe();
      if (syncTimeout.current) clearTimeout(syncTimeout.current);
      if (imageSyncTimeout.current) clearTimeout(imageSyncTimeout.current);
    };
  }, []);

  return <>{children}</>;
}
