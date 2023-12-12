import { describe, it } from 'vitest';
import {
    Transaction,
    CTxIn,
    CTxOut,
    COutpoint,
} from '../../scripts/transaction.js';

describe('transaction tests', () => {
    function getDummyTx() {
        const tx = new Transaction();
        tx.version = 1;
        tx.vin = [
            new CTxIn({
                outpoint: new COutpoint({
                    txid: 'f8f968d80ac382a7b64591cc166489f66b7c4422f95fbd89f946a5041d285d7c',
                    n: 1,
                }),
                scriptSig:
                    '483045022100a4eac56caaf3700c4f53822fbb858256f3a5c154d268f416ade685de3fe61de202206fb38cfe8fd4faf8b14dc7ac0799c4acfd50a81c4d93509ebd6fb0bca3bb8a7a0121035b57e0afed95b86ad3ccafb9a8c752dc173cea16274cf9dd9b7a43364d36cf38',
            }),
        ];
        tx.vout = [
            new CTxOut({
                script: '76a914f49b25384b79685227be5418f779b98a6be4c73888ac',
                value: 0.049924 * 10 ** 8,
            }),
            new CTxOut({
                script: '76a914a95cc6408a676232d61ec29dc56a180b5847835788ac',
                value: 0.05 * 10 ** 8,
            }),
        ];
        return tx;
    }
    function getDummyTxid() {
        return '9cf01cffc85d53b80a9c7ca106fc7326efa0f4f1db3eaf5be0ac45eb6105b8ab';
    }
    function getDummyTxHex() {
        return '01000000017c5d281d04a546f989bd5ff922447c6bf6896416cc9145b6a782c30ad868f9f8010000006b483045022100a4eac56caaf3700c4f53822fbb858256f3a5c154d268f416ade685de3fe61de202206fb38cfe8fd4faf8b14dc7ac0799c4acfd50a81c4d93509ebd6fb0bca3bb8a7a0121035b57e0afed95b86ad3ccafb9a8c752dc173cea16274cf9dd9b7a43364d36cf38ffffffff02902d4c00000000001976a914f49b25384b79685227be5418f779b98a6be4c73888ac404b4c00000000001976a914a95cc6408a676232d61ec29dc56a180b5847835788ac00000000';
    }

    function getDummyColdTx() {
        return new Transaction({
            version: 1,
            vin: [
                new CTxIn({
                    outpoint: new COutpoint({
                        txid: 'bf6d18b280a5c68480e9cad557589729668be59bda48375906a04fd9fbf6ff13',
                        n: 0,
                    }),
                    scriptSig:
                        '4830450221009de7f40ae52ae9da0fd103c40e3f914654fd699909c8ff9b083983701d807a0c02203d81de9ebca45f067317fcb5c31326cd9aa18734abe015ffd65cfef62f710dde012102ff1cfb54a2ec3de473e3171d0724356f3e80c6522319b521b5454ddd62403a3e',
                }),
            ],
            vout: [
                new CTxOut({
                    script: '76a9143232b7bd616dd5ebeefcd216671fe9a7c2f96b2e88ac',
                    value: 4.099782 * 10 ** 8,
                }),
                new CTxOut({
                    script: '76a97b63d114f912041b9c6d2351a4022cb1e8ee0108ed7239796714c212b614b19765cd544e8c2186fa17d6b8aeb2f16888ac',
                    value: 1 * 10 ** 8,
                }),
            ],
        });
    }

    function getDummyColdHex() {
        return '010000000113fff6fbd94fa006593748da9be58b6629975857d5cae98084c6a580b2186dbf000000006b4830450221009de7f40ae52ae9da0fd103c40e3f914654fd699909c8ff9b083983701d807a0c02203d81de9ebca45f067317fcb5c31326cd9aa18734abe015ffd65cfef62f710dde012102ff1cfb54a2ec3de473e3171d0724356f3e80c6522319b521b5454ddd62403a3effffffff0258c56f18000000001976a9143232b7bd616dd5ebeefcd216671fe9a7c2f96b2e88ac00e1f505000000003376a97b63d114f912041b9c6d2351a4022cb1e8ee0108ed7239796714c212b614b19765cd544e8c2186fa17d6b8aeb2f16888ac00000000';
    }
    it('serializes correctly', () => {
        const tx = getDummyTx();
        expect(tx.serialize()).toBe(getDummyTxHex());
        expect(tx.txid).toBe(getDummyTxid());
    });

    it('deserializes correctly', () => {
        const tx = Transaction.fromHex(getDummyTxHex());
        expect(tx).toStrictEqual(getDummyTx());
    });

    it('deserializes cold txs correctly', () => {
        const tx = Transaction.fromHex(getDummyColdHex());
        expect(tx).toStrictEqual(getDummyColdTx());
    });

    it('serializes cold txs correctly', () => {
        const tx = getDummyColdTx();
        expect(tx.serialize()).toBe(getDummyColdHex());
    });

    it.todo('computes sighash correctly', () => {
        const tx = getDummyTx();
        //expect(tx.transactionHash(0)).toBe('642bd7df1ddd9998afb2826200754a586acc72ce6229c48b40d392eb1b7281b1');
    });

    it('deserializes coinbase tx correctly', () => {
        const tx = Transaction.fromHex(
            '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff05035e9c3f00ffffffff0100000000000000000000000000'
        );
        expect(tx.txid).toBe(
            'ae5f760b98070225757b1e21a2e84882ab9f71dff5a6aebde69f5d7ca20be6da'
        );
    });

    it('deserializes coinstake tx correctly', () => {
        const tx = Transaction.fromHex(
            '010000000124c18e60883b3a8897e1320085fcf379ad4e717e3a743be02b282161603a3c5601000000484730440220773979ad4cac8eb810cc57c8099866f7c2512550b877559a8c2f61e99e1780630220057bb31305908a3d502238d9535b90446721513324df221c4d0805d8681005a001ffffffff03000000000000000000a009edc610000000232103112df8b7ece0ebdfaa17d13d7d9e4df3ff1261ba107d9f929c6eea633c71bd90ac0046c323000000001976a9140363526ab523d61302f8c74305e5891ad8af922388ac00000000'
        );
        expect(tx.txid).toBe(
            'a9c4aea4a3b7962ce6d33190f738ee6cf266e5dd3b7061f25fd8f285ae1fabba'
        );
    });

    it('signs correctly', async () => {
        const tx = getDummyTx();
        tx.vin[0].scriptSig =
            '76a914f49b25384b79685227be5418f779b98a6be4c73888ac';
        const wif = 'YU12G8Y9LwC3wb2cwUXvvg1iMvBey1ibCF23WBAapCuaKhd6a4R6';
        await tx.signInput(0, wif);
        expect(tx.vin[0].scriptSig).toBe(getDummyTx().vin[0].scriptSig);
    });
});
