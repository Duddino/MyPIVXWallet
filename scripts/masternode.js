"use strict";

class Masternode {
    static protocolVersion = 70926;
    constructor({walletPrivateKey, mnPrivateKey, collateralTxId, outidx, addr} = {}) {
	this.walletPrivateKey = walletPrivateKey;
	this.mnPrivateKey = mnPrivateKey;
	this.collateralTxId = collateralTxId;
	this.outidx = outidx;
	this.addr = addr;
    }

    async getStatus() {
	const url= `${cNode.url}/listmasternodes?params=${this.collateralTxId}`;
	try {
	    const masternodes = (await (await fetch(url)).json()).filter(m=>m.outidx === this.outidx);
	    if(masternodes.length > 0) {
		return sanitizeHTML(masternodes[0].status);
	    } else {
		return "NOT_FOUND";
	    }
	} catch(e) { //this is the unfortunate state in which the node is not reachable
	    console.error(e);
	    return "COULD NOT CONNECT TO THE EXPLORER";
	}
    }
    
    static decodeIpAddress(ip, port) {
	// Only ipv4 for now
	let start = '00000000000000000000ffff';
	for (const digit of ip.split('.').map(n=>parseInt(n))) {
	    start += ('0' + (digit).toString(16)).slice(-2);
	}
	start += Crypto.util.bytesToHex(Masternode.numToBytes(port, 2, false));
	return start;
    }

    static numToBytes(number, numBytes=8, littleEndian = true) {
	const bytes = [];
	for(let i=0; i<numBytes; i++) {
	    bytes.push((number / 2**(8*i)) & 0xFF);
	}
	return littleEndian ? bytes : bytes.reverse();
    }

    // Get message to be signed with mn private key.
    static getPingSignature(msg) {
	const ping = [
	    ...Crypto.util.hexToBytes(msg.vin.txid).reverse(),
	    ...Masternode.numToBytes(msg.vin.idx, 4, true),
	    // Should be tx sequence, but 0xffffff is fine
	    ...[0, 255, 255, 255, 255],
	    ...Crypto.util.hexToBytes(msg.blockHash).reverse(),
	    ...Masternode.numToBytes(msg.sigTime, 8, true),
	];
	const hash = new jsSHA(0, 0, {numRounds: 2});
	hash.update(ping);
	return hash.getHash(0);
    }

    // Get message to be signed with collateral private key.
    // Needs to be padded with "\x18DarkNet Signed Message:\n" + Message length + Message
    // Then hashed two times with SHA256
    static getToSign(msg) {
	const [ ip, port ] = msg.addr.split(":");
	const publicKey = deriveAddress({
	    pkBytes: parseWIF(msg.walletPrivateKey, true),
	    output: "RAW_BYTES",
	    compress: true,
	});
	const mnPublicKey = deriveAddress({
	    pkBytes: parseWIF(msg.mnPrivateKey, true),
	    output: "RAW_BYTES",
	    compress: true,
	});

	const pkt = [
	    ...Masternode.numToBytes(1, 4, true), // Message version
	    ...Crypto.util.hexToBytes(Masternode.decodeIpAddress(ip, port)), // Encoded ip + port
	    ...Masternode.numToBytes(msg.sigTime, 8, true),
	    ...Masternode.numToBytes(publicKey.length, 1, true), // Collateral public key length
	    ...publicKey,
	    ...Masternode.numToBytes(mnPublicKey.length, 1, true), // Masternode public key length
	    ...mnPublicKey,
	    ...Masternode.numToBytes(Masternode.protocolVersion, 4, true), // Protocol version
	];
	const hash = new jsSHA(0, 0, {numRounds: 2});
	hash.update(pkt);
	// It's important to note that the thing to be signed is the hex representation of the hash, not the bytes
	return Crypto.util.bytesToHex(hash.getHash(0).reverse());
    }

    static async getLastBlockHash() {
	const status = await (await fetch(`${cExplorer.url}/api/`)).json();
	return status.backend.bestBlockHash;
    }

    async getSignedMessage(sigTime) {
	const padding = "\x18DarkNet Signed Message:\n"
	      .split("").map(c=>c.charCodeAt(0));
	const toSign = Masternode.getToSign({
	    addr: this.addr,
	    walletPrivateKey: this.walletPrivateKey,
	    mnPrivateKey: this.mnPrivateKey,
	    sigTime,
	}).split("").map(c=>c.charCodeAt(0));
	const hash = new jsSHA(0, 0, { numRounds: 2 });
	hash.update(padding
		    .concat(toSign.length)
		    .concat(toSign));
	const [ signature, v ] = await nobleSecp256k1.sign(hash.getHash(0), parseWIF(this.walletPrivateKey, true), { der: false, recovered: true});
	return [
	    v + 31, ...signature
	];
    }

    async getSignedPingMessage(sigTime, blockHash) {
	const toSign = Masternode.getPingSignature({
	    vin: {
		txid: this.collateralTxId,
		idx: this.outidx,
	    },
	    blockHash,
	    sigTime,
	});
	const [ signature, v ] = await nobleSecp256k1.sign(toSign, parseWIF(this.mnPrivateKey, true), { der: false, recovered: true});
	return [
	    v + 27, ...signature,
	];
    }

    // Get the message to start a masternode.
    // It needs to have two signatures: `getPingSignature()` which is signed
    // With the masternode private key, and `getToSign()` which is signed with
    // The collateral private key
    async broadcastMessageToHex() {
	const sigTime = Math.round(Date.now() / 1000);
	const blockHash = await Masternode.getLastBlockHash();
	const [ ip, port ] = this.addr.split(':');
	const walletPublicKey = deriveAddress({
	    pkBytes: parseWIF(this.walletPrivateKey, true),
	    output: "RAW_BYTES",
	    compress: true,
	});
	const mnPublicKey = deriveAddress({
	    pkBytes: parseWIF(this.mnPrivateKey, true),
	    output: "RAW_BYTES",
	    compress: true,
	});
	const sigBytes = await this.getSignedMessage(sigTime);
	const sigPingBytes = await this.getSignedPingMessage(sigTime, blockHash);

	const message = [
	    ...Crypto.util.hexToBytes(this.collateralTxId).reverse(),
	    ...Masternode.numToBytes(this.outidx, 4, true),
	    ...Masternode.numToBytes(0, 1, true), // Message version
	    ...Masternode.numToBytes(0xffffffff, 4, true),
	    ...Crypto.util.hexToBytes(Masternode.decodeIpAddress(ip, port)),
	    ...Masternode.numToBytes(walletPublicKey.length, 1, true),
	    ...walletPublicKey,
	    ...Masternode.numToBytes(mnPublicKey.length, 1, true),
	    ...mnPublicKey,
	    ...Masternode.numToBytes(sigBytes.length, 1, true),
	    ...sigBytes,
	    ...Masternode.numToBytes(sigTime, 8, true),
	    ...Masternode.numToBytes(Masternode.protocolVersion, 4, true),
	    ...Crypto.util.hexToBytes(this.collateralTxId).reverse(),
	    ...Masternode.numToBytes(this.outidx, 4, true),
	    ...Masternode.numToBytes(0, 1, true),
	    ...Masternode.numToBytes(0xffffffff, 4, true),
	    ...Crypto.util.hexToBytes(blockHash).reverse(),
	    ...Masternode.numToBytes(sigTime, 8, true),
	    ...Masternode.numToBytes(sigPingBytes.length, 1, true),
	    ...sigPingBytes,
	    ...Masternode.numToBytes(1, 4, true),
	    ...Masternode.numToBytes(1, 4, true),
	];
	return Crypto.util.bytesToHex(message);
    }

    async start() {
	const message = await this.broadcastMessageToHex();
	const url = `${cNode.url}/relaymasternodebroadcast?params=${message}`;
	const response = await (await fetch(url)).text();
	return response.includes("Masternode broadcast sent");
    }

    static async getProposals() {
	const url = `${cNode.url}/getbudgetinfo`;
	return await (await fetch(url)).json();
    }

    async getSignedVoteMessage(hash, voteCode, sigTime) {
	const msg = [
	    ...Crypto.util.hexToBytes(this.collateralTxId).reverse(),
	    ...Masternode.numToBytes(this.outidx, 4, true),
	    // Should be tx sequence, but 0xffffff is fine
	    ...[0, 255, 255, 255, 255],
	    ...Crypto.util.hexToBytes(hash).reverse(),
	    ...Masternode.numToBytes(voteCode, 4, true),
	    ...Masternode.numToBytes(sigTime, 8, true),
	];
	const sha = new jsSHA(0, 0, {numRounds: 2});
	sha.update(msg);
	const [ signature, v ] = await nobleSecp256k1.sign(sha.getHash(0), parseWIF(this.mnPrivateKey, true), { der: false, recovered: true});
	return Crypto.util.bytesToBase64([
	    v + 27, ...signature,
	]);
    }

    async vote(hash, voteCode) {
	const sigTime = Math.round(Date.now() / 1000);
	const signature = await this.getSignedVoteMessage(hash, voteCode, sigTime);
	const url = `${cNode.url}/mnbudgetrawvote?params=${this.collateralTxId},${this.outidx},${hash},${voteCode === 1 ? "yes" : "no"},${sigTime},${encodeURI(signature).replaceAll("+", "%2b")}`;
	const text = await (await fetch(url)).text();
	return text;
    }
}
