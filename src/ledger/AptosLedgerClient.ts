// Copyright © Aptos
// SPDX-License-Identifier: Apache-2.0

import { AuthenticationKey, Ed25519PublicKey } from '@aptos-labs/ts-sdk';
import Transport from '@ledgerhq/hw-transport';
import { StatusCodes } from '@ledgerhq/errors';

const MAX_APDU_LEN = 255;
const P1_NON_CONFIRM = 0x00;
const P1_CONFIRM = 0x01;
const P1_START = 0x00;
const P2_MORE = 0x80;
const P2_LAST = 0x00;

const LEDGER_CLA = 0x5b;
const INS = {
  GET_PUBLIC_KEY: 0x05,
  GET_VERSION: 0x03,
  SIGN_TX: 0x06,
};

export interface AddressData {
  address: string;
  chainCode: Buffer;
  publicKey: Buffer;
}

export function publicKeyToAddress(pubKey: Buffer) {
  const ed25519PublicKey = new Ed25519PublicKey(pubKey);
  const authKey = AuthenticationKey.fromPublicKey({
    publicKey: ed25519PublicKey,
  });
  return authKey.derivedAddress();
}

function throwOnFailure(reply: Buffer): void {
  // transport makes sure reply has a valid length
  const status = reply.readUInt16BE(reply.length - 2);
  if (status !== StatusCodes.OK) {
    throw new Error(`Failure with status code: 0x${status.toString(16)}`);
  }
}

function serializeBip32(path: string) {
  const parts = path
    .split('/')
    .slice(1)
    .map((part) => (part.endsWith("'") ? parseInt(part, 10) + 0x80000000 : parseInt(part, 10)));

  const serialized = Buffer.alloc(1 + parts.length * 4);
  serialized.writeUInt8(parts.length, 0);
  for (const [i, part] of parts.entries()) {
    serialized.writeUInt32BE(part, 1 + i * 4);
  }
  return serialized;
}

/**
 * Aptos API
 *
 * @param transport a transport for sending commands to a device
 * @param scrambleKey a scramble key
 *
 * @example
 * import Aptos from "hw-app-aptos";
 * const aptos = new Aptos(transport);
 */
export default class AptosLedgerClient {
  readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  /**
   * Get Aptos address (public key) for a BIP32 path.
   *
   * Because Aptos uses Ed25519 keypairs, as per SLIP-0010
   * all derivation-path indexes will be promoted to hardened indexes.
   *
   * @param path a BIP32 path
   * @param display flag to show display
   * @returns an object with publicKey, chainCode, address fields
   *
   * @example
   * aptos.getAccount("m/44'/637'/1'/0'/0'").then(r => r.address)
   */
  // @shouldQueue
  async getAccount(
    path: string,
    // the type annotation is needed for doc generator
    // eslint-disable-next-line @typescript-eslint/no-inferrable-types
    display: boolean = false
  ): Promise<AddressData> {
    return this.getAccountRaw(path, display);
  }

  async getAccountRaw(
    path: string,
    // the type annotation is needed for doc generator
    // eslint-disable-next-line @typescript-eslint/no-inferrable-types
    display: boolean = false
  ): Promise<AddressData> {
    const pathBuffer = serializeBip32(path);
    const responseBuffer = await this.sendToDevice(
      INS.GET_PUBLIC_KEY,
      display ? P1_CONFIRM : P1_NON_CONFIRM,
      P2_LAST,
      pathBuffer
    );

    let offset = 0;
    const pubKeyLen = responseBuffer.subarray(offset, offset + 1)[0] - 1;
    offset += 1;

    // Skipping weird 0x04
    offset += 1;

    const pubKeyBuffer = responseBuffer.subarray(offset, offset + pubKeyLen);
    offset += pubKeyLen;

    const chainCodeLen = responseBuffer.subarray(offset, offset + 1)[0];
    offset += 1;

    const chainCodeBuffer = responseBuffer.subarray(offset, offset + chainCodeLen);

    const address = publicKeyToAddress(pubKeyBuffer).toString();

    return {
      address,
      chainCode: chainCodeBuffer,
      publicKey: pubKeyBuffer,
    };
  }

  /**
   * Sign an Aptos transaction.
   *
   * @param path a BIP32 path
   * @param txBuffer serialized transaction
   *
   * @returns an object with the signature field
   *
   * @example
   * aptos.signTransaction("m/44'/637'/1'/0'/0'", txBuffer).then(r => r.signature)
   */
  async signTransaction(path: string, txBuffer: Buffer): Promise<{ signature: Buffer }> {
    const pathBuffer = serializeBip32(path);
    await this.sendToDevice(INS.SIGN_TX, P1_START, P2_MORE, pathBuffer);
    const responseBuffer = await this.sendToDevice(INS.SIGN_TX, 1, P2_LAST, txBuffer);

    const signatureLen = responseBuffer[0];
    const signatureBuffer = responseBuffer.subarray(1, 1 + signatureLen);
    return { signature: signatureBuffer };
  }

  // send chunked if payload size exceeds maximum for a call
  private async sendToDevice(
    instruction: number,
    p1: number,
    p2: number,
    payload: Buffer
  ): Promise<Buffer> {
    const acceptStatusList = [StatusCodes.OK];
    let payloadOffset = 0;

    let packetIdx = p1;
    if (payload.length > MAX_APDU_LEN) {
      while (payload.length - payloadOffset > MAX_APDU_LEN) {
        const buf = payload.subarray(payloadOffset, (payloadOffset += MAX_APDU_LEN));
        // eslint-disable-next-line no-await-in-loop
        const reply = await this.transport.send(
          LEDGER_CLA,
          instruction,
          packetIdx,
          P2_MORE,
          buf,
          acceptStatusList
        );

        packetIdx += 1;
        throwOnFailure(reply);
      }
    }

    const buf = payload.subarray(payloadOffset);
    const reply = await this.transport.send(
      LEDGER_CLA,
      instruction,
      packetIdx,
      p2,
      buf,
      acceptStatusList
    );
    throwOnFailure(reply);

    return reply.subarray(0, reply.length - 2);
  }
}
