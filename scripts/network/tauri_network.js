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
        return { result: res };
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
     * @param {string}  addr
     */
    async #getIncomingTxs(addr) {
        // Number of transaction checked before assuming it's empty
        if (!addr.startsWith('xpub')) {
            return await invoke('explorer_get_txs', { addresses: [addr] });
        }

        const mk = new HdMasterKey({ xpub: addr });
        const gap = MAX_ACCOUNT_GAP;
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

        return sortTxs(parsedTxs);
    }
}

/**
 * @param {Transaction[]} txs
 */
function sortTxs(txs) {
    // The traversal order, as of modern ECMAScript specification, is
    // well-defined and consistent across implementations. Within each
    // component of the prototype chain, all non-negative integer keys
    // (those that can be array indices) will be traversed first in
    // ascending order by value, then other string keys in ascending
    // chronological order of property creation.
    // We use an object and not a map because maps for..in order is based on insertion order
    /**
     * @type{{[key: number]: Transaction[]}}
     */
    const txMap = {};

    for (const tx of txs) {
        if (!txMap[tx.blockHeight]) {
            txMap[tx.blockHeight] = [tx];
        } else {
            if (!txMap[tx.blockHeight].map((t) => t.txid).includes(tx.txid))
                txMap[tx.blockHeight].push(tx);
        }
    }

    const keys = Object.keys(txMap);
    const res = [];

    for (const i of keys.reverse()) {
        res.push(...sortBlock(txMap[i]));
    }
    return res;
}

/**
 * Sort txs that are in the same block by doing a topological sort
 * where if a tx spends another it has an edge
 * Based on Kahn's algorithm https://en.wikipedia.org/wiki/Topological_sorting
 * @param {Transaction[]} txs
 */
export function sortBlock(txs) {
    /**
     * maps txid -> transactions[]
     * where Tx.txid spends each transaction in the array
     * @type {Map<string, Transaction[]>}
     */
    debugger;
    const edges = new Map();
    for (const tx of txs) {
        edges.set(
            tx.txid,
            txs.filter((tx2) =>
                tx.vin.map((v) => v.outpoint.txid).includes(tx2.txid)
            )
        );
    }
    /**
     * Set of all nodes with no incoming edge
     */
    const s = [];
    const hasIncomingEdges = (tx) => {
        let found = false;
        for (const edge of edges.values()) {
            if (edge.includes(tx)) {
                found = true;
                break;
            }
        }
        return found;
    };
    for (const tx of txs) {
        if (!hasIncomingEdges(tx)) s.push(tx);
    }
    /**
     * list that will contain the sorted nodes
     * @type{Transaction[]}
     */
    const l = [];
    while (s.length) {
        const node = s.pop();
        l.push(node);
        const others = edges.get(node.txid);
        edges.delete(node.txid);
        for (const other of others) {
            if (!hasIncomingEdges(other)) {
                s.push(other);
            }
        }
    }
    console.log(edges);
    if (edges.size) throw new Error('Cyclic graph');
    return l;
}
