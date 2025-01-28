import { sortBlock } from '../../scripts/network/tauri_network.js';
import { Transaction, CTxIn, COutpoint } from '../../scripts/transaction.js';

describe('sortBlock', () => {
    /*it('sorts independent transactions correctly', () => {
    const tx1 = new Transaction({ txid: 'tx1' });
    const tx2 = new Transaction({ txid: 'tx2' });
    const txs = [tx1, tx2];

    const sorted = sortBlock(txs);

    expect(sorted).toEqual([tx1, tx2]);
  });*/

    it('sorts transactions with a spending dependency', () => {
        const tx1 = new Transaction({ txid: 'tx1' });
        const tx2 = new Transaction({
            txid: 'tx2',
            vin: [
                new CTxIn({ outpoint: new COutpoint({ txid: 'tx1', n: 0 }) }),
            ],
        });

        const txs = [tx1, tx2];
        const sorted = sortBlock(txs);

        expect(sorted).toEqual([tx2, tx1]);
    });

    it('handles multiple dependencies', () => {
        const tx1 = new Transaction({ txid: 'tx1' });
        const tx2 = new Transaction({ txid: 'tx2' });
        const tx3 = new Transaction({
            txid: 'tx3',
            vin: [
                new CTxIn({ outpoint: new COutpoint({ txid: 'tx1', n: 0 }) }),
                new CTxIn({ outpoint: new COutpoint({ txid: 'tx2', n: 0 }) }),
            ],
        });

        const txs = [tx1, tx3, tx2];
        const sorted = sortBlock(txs);

        expect(sorted).toEqual([tx3, tx2, tx1]);
    });

    it('throws an error on a cyclic graph', () => {
        const tx1 = new Transaction({
            txid: 'tx1',
            vin: [
                new CTxIn({ outpoint: new COutpoint({ txid: 'tx2', n: 0 }) }),
            ],
        });
        const tx2 = new Transaction({
            txid: 'tx2',
            vin: [
                new CTxIn({ outpoint: new COutpoint({ txid: 'tx1', n: 0 }) }),
            ],
        });

        const txs = [tx1, tx2];

        expect(() => sortBlock(txs)).toThrow('Cyclic graph');
    });

    it('handles an empty list gracefully', () => {
        const txs = [];
        const sorted = sortBlock(txs);
        expect(sorted).toEqual([]);
    });
});
