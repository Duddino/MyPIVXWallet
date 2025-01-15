import { ref } from 'vue';
import { defineStore } from 'pinia';
import { invoke } from '@tauri-apps/api';

export const useTauri = defineStore('tauri', () => {
    const initialSync = ref(true);
    const progress = ref(0.0);

    const interval = setInterval(async () => {
        initialSync.value = await invoke('explorer_is_initial_sync');
        progress.value = await invoke('explorer_get_sync_progress');

        if (!initialSync.value) {
            progress.value = ref(1.0);
            clearInterval(interval);
        }
    }, 100);

    return {
        initialSync,
        progress,
    };
});
