import { Network } from './network.js';
import { wallet } from '../wallet.js';
import { invoke } from '@tauri-apps/api/tauri';
import { Transaction } from '../transaction.js';
import { HdMasterKey } from '../masterkey.js';
import { MAX_ACCOUNT_GAP } from '../chain_params.js';

export class TauriNetwork extends Network {
    submitAnalytics() {}

    /**
     * Fetch a block from the node given the height
     * @param {number} blockHeight
     * @param {boolean} skipCoinstake - if true coinstake tx will be skipped
     * @returns {Promise<Object>} the block fetched from explorer
     */
    async getBlock(blockHeight, skipCoinstake = false) {
        const block = await invoke('explorer_get_block', {
            blockHeight,
        });
        return JSON.parse(block);
    }

    async getBlockCount() {
        return await invoke('explorer_get_block_count');
    }

    async sendTransaction(transaction) {
        const res = await invoke('explorer_send_transaction', { transaction });
        return res;
    }

    /**
     * @return {Promise<Number[]>} The list of blocks which have at least one shield transaction
     */
    async getShieldBlockList() {
        // TODO: fixme
        return await (
            await fetch(`https://rpc.duddino.com/mainnet/getshieldblocks`)
        ).json();
    }

    async getNumPages() {
        return 1;
    }

    async #getSpentTxs() {}

    #parseTx(hex, height, time) {
        const parsed = Transaction.fromHex(hex);
        parsed.blockHeight = height;
        parsed.blockTime = time;
        return parsed;
    }

    /**
     * @returns {Promise<[string, number, number][]>} the incoming txs of an address.
     * We can do this by using `explorer_get_txs` with our own addresses
     */
    async #getIncomingTxs(addr) {
        // Number of transaction checked before assuming it's empty
        const gap = MAX_ACCOUNT_GAP;
        const mk = new HdMasterKey({ xpub: addr });
        let txs = [];

        for (let i = 0; i < 2; i++) {
            let index = 0;
            // Loop until we have checked all the addresses up to the gap
            while (true) {
                const addresses = [];
                for (let j = index; j < index + gap; j++) {
                    const address = mk.getAddress(
                        mk.getDerivationPath(0, i, j)
                    );
                    addresses.push(address);
                }

                // Fetch txs from the index
                /**
                 * @type{[string, number, number][]}
                 */
                const newTxs = await invoke('explorer_get_txs', {
                    addresses: addresses,
                });
                for (const tx of newTxs) {
                    if (newTxs.map(([hex]) => hex).includes(tx[0])) {
                        txs.push(tx);
                    }
                }

                // Txs are ordered based on the addresses we passed.
                // Since our values were ordered by index, we can safely
                // Check the last hex
                const lastTx = newTxs.at(-1);
                if (lastTx) {
                    const tx = this.#parseTx(...lastTx);
                    let lastIndex = Number.NEGATIVE_INFINITY;
                    for (const vout of tx.vout) {
                        const path = wallet.getPath(vout.script);
                        if (!path) continue;
                        wallet.updateHighestUsedIndex(vout);

                        lastIndex = Math.max(
                            lastIndex,
                            Number.parseInt(path.split('/').at(-1))
                        );
                    }
                    if (
                        lastIndex === Number.NEGATIVE_INFINITY ||
                        Number.isNaN(lastIndex)
                    ) {
                        // This should never happen, the index should have given us a valid tx
                        throw new Error('Invalid last index');
                    } else {
                        index = lastIndex + 1;
                    }
                } else {
                    // No new tx, we have checked every address up to the gap
                    break;
                }
            }
        }
        return txs;
    }

    async getTxPage(nStartHeight, addr, _n) {
        const parsedTxs = [];
        const parseTx = (hex, height, time) => {
            const tx = this.#parseTx(hex, height, time);
            for (const vout of tx.vout) {
                wallet.updateHighestUsedIndex(vout);
            }
            parsedTxs.push(tx);
            return tx;
        };

        const incomingTxs = await this.#getIncomingTxs(addr);

        // Get outgoing txs
        // We do this by getting our own vouts, and getting the full tx
        // Based on that vout (Which will be that tx's vin)
        for (const [hex, height, time] of incomingTxs) {
            const parsed = parseTx(hex, height, time);
            for (let i = 0; i < parsed.vout.length; i++) {
                const vout = parsed.vout[i];

                const path = wallet.getPath(vout.script);
                if (!path) continue;
                wallet.updateHighestUsedIndex(vout);
                const tx = await invoke('explorer_get_tx_from_vin', {
                    vin: {
                        txid: parsed.txid,
                        vout: i,
                    },
                });
                if (!tx) continue;
                const [hex, height, time] = tx;
                parseTx(hex, height, time);
            }
        }
        // This may not work for blocks with 2+ tx.
        // But it's fairly unlikely, so i'll leave it for a future improvement
        return parsedTxs.sort((a, b) => {
            const comp = b.blockHeight - a.blockHeight;
            if (comp !== 0) return comp;
            if (b.vin.map((v) => v.outpoint.txid).includes(a.txid)) {
                // b spends a, a goes second (We need to reverse the order for MPW)
                return 1;
            }
            if (a.vin.map((v) => v.outpoint.txid).includes(b.txid)) {
                // a spends b, b goes second
                return -1;
            }
            // Either can work.
            return -1;
        });
    }
}
