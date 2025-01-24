import { ref } from 'vue';
import { defineStore } from 'pinia';
import { invoke } from '@tauri-apps/api';

export const useTauri = defineStore('tauri', () => {
    /**
     * 0 = syncing PIVX node
     * 1 = syncing index
     * 2 = ready to use
     */
    const loadingState = ref(0);
    const progress = ref(0.0);

    const interval = setInterval(async () => {
        switch (loadingState.value) {
            case 0: {
                const isDoneSyncing = !(await invoke(
                    'explorer_is_initial_sync'
                ));
                // If it's done syncing, go to the next state
                loadingState.value = isDoneSyncing ? 1 : 0;
                progress.value = await invoke('explorer_get_sync_progress');
                break;
            }
            case 1: {
                const indexIsDone = await invoke('explorer_index_is_done');
                // if index is done, go to the next state
                loadingState.value = indexIsDone ? 2 : 1;
                progress.value = await invoke('explorer_get_index_progress');
                break;
            }
        }

        if (loadingState.value === 3) {
            progress.value = ref(1.0);
            clearInterval(interval);
        }
    }, 100);

    return {
        loadingState,
        progress,
    };
});
