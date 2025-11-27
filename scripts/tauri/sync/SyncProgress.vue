<script setup>
import { useTauri } from '../../composables/use_tauri';
import { translation } from '../../i18n';
import { ref, watch } from 'vue';
import Modal from '../../Modal.vue';
import Loadingbar from '../../Loadingbar.vue';
import { onMounted } from 'vue';
import { computed } from 'vue';
const tauri = useTauri();

const startingProgress = ref(0);
const startingTime = ref();
const description = computed(() => {
    return (
        [
            translation.checkpointDownloadRow1,
            translation.pivxSyncBodyRow1,
            translation.indexSyncBodyRow1,
        ][tauri.loadingState] ?? ''
    );
});

function resetRollingAverage() {
    startingProgress.value = tauri.progress;
    startingTime.value = new Date();
}

function eta() {
    const elapsed = new Date() - startingTime.value;

    const progress =
        (tauri.progress - startingProgress.value) /
        (1 - startingProgress.value);

    if (progress <= 0) return '';
    const ms = elapsed * (1 / progress - 1);
    return `ETA ${formatDuration(ms)}`;
}

function formatDuration(ms) {
    const totalSeconds = Math.round(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    } else {
        return `${seconds}s`;
    }
}

onMounted(() => {
    setTimeout(resetRollingAverage, 2000);
});
watch(() => tauri.loadingState, resetRollingAverage);
</script>

<template>
    <Teleport to="body">
        <Modal :show="tauri.loadingState !== 3">
            <template #header>
                <h3
                    class="modal-title"
                    style="text-align: center; width: 100%; color: #8e21ff"
                >
                    {{ translation.pivxSync }}
                </h3>
            </template>
            <template #body>
                <div class="syncBody">
                    {{ description }}
                    {{ '\n' }}
                    {{ translation.pivxSyncBodyRow2 }}
                    <center>
                        <Loadingbar
                            :show="true"
                            :percentage="tauri.progress * 100"
                        />
                        {{ eta() }}
                    </center>
                </div>
            </template>
        </Modal>
    </Teleport>
</template>

<style>
.syncBody {
    display: grid;
    gap: 20px;
    margin-bottom: 20px;
}
</style>
