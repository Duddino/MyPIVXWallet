<script setup>
import { useTauri } from '../../composables/use_tauri';
import { translation } from '../../i18n';
import Modal from '../../Modal.vue';
import Loadingbar from '../../Loadingbar.vue';
const tauri = useTauri();
</script>

<template>
    <Teleport to="body">
        <Modal :show="tauri.initialSync">
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
                    {{ translation.pivxSyncBodyRow1 }}
                    {{ '\n' }}
                    {{ translation.pivxSyncBodyRow2 }}
                    <center>
                        <Loadingbar
                            :show="true"
                            :percentage="tauri.progress * 100"
                        />
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
