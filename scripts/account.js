import { getEventEmitter } from './event_bus.js';
import { MasterKey } from './wallet.js';
import Masternode from './masternode.js';
import { Mempool } from './mempool.js';

export class Account {
    /**
     * The masternode associated with this account
     * @type {Masternode?}
     */
    #masternode = null;
    
    constructor({
	masterKey,
	masternode,
    }) {
	/**
	 * @type {MasterKey}
	 */
	this.masterKey = masterKey;


	this.#masternode = masternode;

	/**
	 * @type {Mempool}
	 */
	this.mempool = new Mempool();
    }

    /**
     * @returns {Number} Balance in satoshi
     */
    getBalance() {
	this.mempool.getBalance();
    }

    /**
     * @returns {Number} Staked balance in satoshi
     */
    getStakingBalance() {
	this.mempool.getDelegatedBalance();
    }

    /**
     * @returns {Masternode?} Masternode associated with this account
     */
    get masternode() {
	return this.#masternode;
    }

    set masternode(masternode) {
	// Update db?
	this.#masternode = masternode;
    }

    /**
     * @type {Account?} active account
     */
    static #activeAccount = null;

    /**
     * @returns {Account?} Active account
     */
    static get activeAccount() {
	return this.#activeAccount;
    }

    /**
     * @param {Account?} account - Account to switch to
     */
    static set activeAccount(account) {
	getEventEmitter().emit('switch-account', account);
	this.#activeAccount = account;
    }
}
