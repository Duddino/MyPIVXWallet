import { Network } from './network.js';
import { wallet } from '../wallet.js';
import { invoke } from '@tauri-apps/api/tauri';
import { Transaction } from '../transaction.js';
import { HdMasterKey } from '../masterkey.js';

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
        const gap = 30;
        const mk = new HdMasterKey({ xpub: addr });
        let txs = [];
        const addresses = [];
        for (let i = 0; i < 2; i++) {
            let index = 0;
            // Loop until we have checked all the addresses up to the gap
            while (true) {
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
                txs = [...txs, ...newTxs];
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

                        lastIndex = Math.max(
                            lastIndex,
                            Number.parseInt(path.split('/').at(-1))
                        );
                    }
                    if (
                        lastIndex === Number.NEGATIVE_INFINITY ||
                        Number.isNaN(lastIndex)
                    ) {
                        // This should never happen, the index should have gave us a valid tx
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
                const tx = await invoke('explorer_get_tx_from_vin', {
                    vin: {
                        txid: parsed.txid,
                        n: i,
                    },
                });
                if (!tx) continue;
                const [hex, height, time] = tx;
                parseTx(hex, height, time);
            }
        }
        return parsedTxs
            .sort((tx) => tx.blockHeight)
            .map((tx) => {
                const parsed = Transaction.fromHex(tx.hex);
                parsed.blockHeight = tx.blockHeight;
                parsed.blockTime = tx.blockTime;
                return parsed;
            });
    }
}
