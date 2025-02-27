import { Reader } from './reader.js';
import { bytesToNum } from './encoding.js';
import { bytesToHex } from './utils.js';
import { Transaction } from './transaction.js';
import { invoke } from '@tauri-apps/api';

class ShieldSyncer {
    /**
     * @returns {Block[] | null} Array of blocks or null if finished
     */
    getNextBlocks() {}
}

export class NetworkShieldSyncer extends ShieldSyncer {
    /**
     * @type {import('./network/network.js').Network}
     */
    #network;
    /**
     * @type{number}
     */
    #lastSyncedBlock;
    #totalBlocks;
    #firstSyncedBlock;

    constructor() {
        super();

        if (new.target !== NetworkShieldSyncer)
            throw new Error('Call create instead');
    }

    async getNextBlocks() {
        const blockArray = [];
        const blockCount = await this.#network.getBlockCount();
        let tries = 0;
        console.log(this.#lastSyncedBlock);
        console.log(blockCount);

        while (true) {
            this.#lastSyncedBlock += 1;
            if (this.#lastSyncedBlock > blockCount) break;
            const block = await this.#network.getBlock(this.#lastSyncedBlock);
            if (block.tx && block.tx.length > 0)
                blockArray.push({
                    time: block.mediantime,
                    height: this.#lastSyncedBlock - 1,
                    txs: block.tx.map((tx) => {
                        return {
                            hex: tx.hex,
                            txid: tx.txid,
                        };
                    }),
                });
            tries++;
            if (blockArray.length > 100 || tries > 200) {
                break;
            }
        }
        console.log(blockArray);
        if (blockArray.length === 0) return null;

        return blockArray;
    }

    /**
     * @param {import('./network/network.js').Network} network
     * @returns {Promise<NetworkShieldSyncer>}
     */
    static async create(network, lastSyncedBlock) {
        const syncer = new NetworkShieldSyncer();
        syncer.#network = network;
        syncer.#lastSyncedBlock = lastSyncedBlock + 1;
        syncer.#firstSyncedBlock = lastSyncedBlock;
        syncer.#totalBlocks = await network.getBlockCount();
        return syncer;
    }

    getLength() {
        return this.#totalBlocks - this.#firstSyncedBlock;
    }

    getReadBytes() {
        return this.#lastSyncedBlock - this.#firstSyncedBlock;
    }
}

export class BinaryShieldSyncer extends ShieldSyncer {
    /**
     * @type {Reader}
     */
    #reader;

    async getNextBlocks() {
        let txs = [];
        const blocksArray = [];
        while (blocksArray.length <= 10) {
            const packetLengthBytes = await this.#reader.read(4);
            if (!packetLengthBytes) break;
            const packetLength = Number(bytesToNum(packetLengthBytes));

            const bytes = await this.#reader.read(packetLength);
            if (!bytes) throw new Error('Stream was cut short');
            if (bytes[0] === 0x5d) {
                const height = Number(bytesToNum(bytes.slice(1, 5)));
                const time = Number(bytesToNum(bytes.slice(5, 9)));

                blocksArray.push({ txs, height, time });
                txs = [];
            } else if (bytes[0] === 0x03) {
                // 0x03 is the tx version. We should only get v3 transactions
                const hex = bytesToHex(bytes);
                txs.push({
                    hex,
                    txid: Transaction.getTxidFromHex(hex),
                });
            } else {
                // This is neither a block or a tx.
                throw new Error('Failed to parse shield binary');
            }
        }
        return blocksArray.length ? blocksArray : null;
    }

    constructor() {
        super();

        if (new.target !== BinaryShieldSyncer)
            throw new Error('Call create instead');
    }

    /**
     * @param {import('./network/network.js').Network} network
     * @returns {Promise<BinaryShieldSyncer>}
     */
    static async create(network, lastSyncedBlock) {
        const req = await network.getShieldData(lastSyncedBlock + 1);
        if (!req.ok) throw new Error("Couldn't sync shield");
        const instance = new BinaryShieldSyncer();

        instance.#reader = new Reader(req);
        return instance;
    }

    getLength() {
        return this.#reader.contentLength;
    }

    getReadBytes() {
        return this.#reader.readBytes;
    }
}
