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

    async getTxPage(nStartHeight, addr, _n) {
        const mk = new HdMasterKey({ xpub: addr });
        let txs = [];
        const addresses = [];
        for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 500; j++) {
                const address = mk.getAddress(mk.getDerivationPath(0, i, j));
                addresses.push(address);
            }
        }
        txs = [
            ...txs,
            ...(await invoke('explorer_get_txs', {
                addresses: addresses,
            })),
        ];

        const parsedTxs = [];
        const parseTx = async (hex, height, time) => {
            const parsed = Transaction.fromHex(hex);
            parsed.blockHeight = height;
            parsed.blockTime = time;
            parsedTxs.push(parsed);
            return parsed;
        };

        //}
        for (const [hex, height, time] of txs) {
            const parsed = await parseTx(hex, height, time);
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
                await parseTx(hex, height, time);
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
