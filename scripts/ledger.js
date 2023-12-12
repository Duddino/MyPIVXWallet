import createXpub from 'create-xpub';
import { ALERTS, tr, translation } from './i18n.js';
import AppBtc from '@ledgerhq/hw-app-btc';
import TransportWebUSB from '@ledgerhq/hw-transport-webusb';
import { confirmPopup, createAlert } from './misc.js';
import { getNetwork } from './network.js';
import { Transaction } from './transaction.js';
import { cChainParams } from './chain_params.js';

/**
 * @type{TransportWebUSB}
 */
let transport;
/**
 * @type {AppBtc?}
 */
export let cHardwareWallet = null;
export let strHardwareName = '';
/**
 * Get hardware wallet keys.
 * @param {string} path - bip32 path to the key
 * @returns {Promise<string?>}
 */
export async function getHardwareWalletKeys(path, xpub = false, verify = true) {
    try {
        // Check if we haven't setup a connection yet OR the previous connection disconnected
        if (!cHardwareWallet || transport._disconnectEmitted) {
            const AppBtc = (await import('@ledgerhq/hw-app-btc')).default;
            const TransportWebUSB = (
                await import('@ledgerhq/hw-transport-webusb')
            ).default;
            transport = await TransportWebUSB.create();
            cHardwareWallet = new AppBtc({ transport, currency: 'PIVX' });
        }

        // Update device info and fetch the pubkey
        strHardwareName =
            transport.device.manufacturerName +
            ' ' +
            transport.device.productName;

        // Prompt the user in both UIs
        if (verify) createAlert('info', ALERTS.WALLET_CONFIRM_L, 3500);
        const cPubKey = await cHardwareWallet.getWalletPublicKey(path, {
            verify,
            format: 'legacy',
        });

        if (xpub) {
            return createXpub({
                depth: 3,
                childNumber: 2147483648,
                chainCode: cPubKey.chainCode,
                publicKey: cPubKey.publicKey,
            });
        } else {
            return cPubKey.publicKey;
        }
    } catch (e) {
        if (e.message.includes('denied by the user')) {
            // User denied an operation
            return null;
        }

        // If there's no device, nudge the user to plug it in.
        if (e.message.toLowerCase().includes('no device selected')) {
            createAlert('info', ALERTS.WALLET_NO_HARDWARE, 10000);
            return null;
        }

        // If the device is unplugged, or connection lost through other means (such as spontanious device explosion)
        if (e.message.includes("Failed to execute 'transferIn'")) {
            createAlert(
                'info',
                tr(ALERTS.WALLET_HARDWARE_CONNECTION_LOST, [
                    {
                        hardwareWallet: strHardwareName,
                    },
                ]),
                10000
            );
            return null;
        }

        // If the ledger is busy, just nudge the user.
        if (e.message.includes('is busy')) {
            createAlert(
                'info',
                tr(ALERTS.WALLET_HARDWARE_BUSY, [
                    {
                        hardwareWallet: strHardwareName,
                    },
                ]),
                7500
            );
            return null;
        }

        // This is when the OS denies access to the WebUSB
        // It's likely caused by faulty udev rules on linux
        if (e instanceof DOMException && e.message.match(/access denied/i)) {
            if (navigator.userAgent.toLowerCase().includes('linux')) {
                createAlert('warning', ALERTS.WALLET_HARDWARE_UDEV, 5500);
            } else {
                createAlert('warning', ALERTS.WALLET_HARDWARE_NO_ACCESS, 5500);
            }

            console.error(e);
            return;
        }

        // Check if this is an expected error
        if (!e.statusCode || !LEDGER_ERRS.has(e.statusCode)) {
            console.error(
                'MISSING LEDGER ERROR-CODE TRANSLATION! - Please report this below error on our GitHub so we can handle it more nicely!'
            );
            throw e;
        }

        // Translate the error to a user-friendly string (if possible)
        createAlert(
            'warning',
            tr(ALERTS.WALLET_HARDWARE_ERROR, [
                {
                    hardwareWallet: strHardwareName,
                },
                {
                    error: LEDGER_ERRS.get(e.statusCode),
                },
            ]),
            5500
        );

        return null;
    }
}

/**
 * @param {import('./wallet.js').Wallet} wallet
 * @param {import('./transaction.js').Transaction} transaction - tx to sign
 */
export async function ledgerSignTransaction(wallet, transaction) {
    const ledgerTx = cHardwareWallet.splitTransaction(transaction.serialize());
    const outputs = transaction.vout.map((o) => {
        const { addresses, type } = wallet.getAddressesFromScript(o.script);
        if (type !== 'pk2pkh') {
            throw new Error(
                'Invalid script. Ledger supports p2pkh scripts only'
            );
        }
        return {
            value: o.value,
            address: addresses[0],
        };
    });

    const associatedKeysets = [];
    const inputs = [];
    for (const input of transaction.vin) {
        const { hex } = await getNetwork().getTxInfo(input.outpoint.hash);
        inputs.push([cHardwareWallet.splitTransaction(hex), input.outpoint.n]);
        // ScriptSig is the script at this point, since it's not signed
        associatedKeysets.push(wallet.getPath(input.scriptSig));
    }
    const outputScriptHex = cHardwareWallet
        .serializeTransactionOutputs(ledgerTx)
        .toString('hex');
    const hex = await confirmPopup({
        title: ALERTS.CONFIRM_POPUP_TRANSACTION,
        html: createTxConfirmation(outputs),
        resolvePromise: cHardwareWallet.createPaymentTransaction({
            inputs,
            associatedKeysets,
            outputScriptHex,
        }),
    });
    const signedTx = Transaction.fromHex(hex);
    // Update vin with signatures
    transaction.vin = signedTx.vin;
    return signedTx;
}

function createTxConfirmation(outputs) {
    let strHtml = tr(translation.CONFIRM_LEDGER_TX, [
        { hardwareWallet: strHardwareName },
    ]);
    for (const { value, address } of outputs) {
        const translated = tr(translation.CONFIRM_LEDGER_TX_OUT, [
            { value },
            { ticker: cChainParams.current.TICKER },
            { address },
        ]);
        strHtml += `<br> <br> ${translated}`;
    }
    return strHtml;
}

// Ledger Hardware wallet constants
export const LEDGER_ERRS = new Map([
    // Ledger error code <--> User-friendly string
    [25870, 'Open the PIVX app on your device'],
    [25873, 'Open the PIVX app on your device'],
    [57408, 'Navigate to the PIVX app on your device'],
    [27157, 'Wrong app! Open the PIVX app on your device'],
    [27266, 'Wrong app! Open the PIVX app on your device'],
    [27904, 'Wrong app! Open the PIVX app on your device'],
    [27010, 'Unlock your Ledger, then try again!'],
    [27404, 'Unlock your Ledger, then try again!'],
]);
