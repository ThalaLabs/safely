// Copyright © Aptos
// SPDX-License-Identifier: Apache-2.0

import TransportNodeHid from '@ledgerhq/hw-transport-node-hid';
import AptosLedgerClient, { publicKeyToAddress } from './AptosLedgerClient.js';
import LedgerSigner from './LedgerSigner.js';
import { AccountAddress } from '@aptos-labs/ts-sdk';

// Singleton storage for active Ledger connections
let activeSigner: LedgerSigner | null = null;
let activeLedgerIndex: number | null = null;

// Initializes a LedgerClient connection with a Ledger hardware wallet.
// This connection must be terminated with `closeLedgerClient` when it is no longer needed.
export async function initLedgerClient(): Promise<AptosLedgerClient> {
  // Establish transport connection with Ledger
  // @ts-ignore
  const transport = await TransportNodeHid.default.open('');

  // Initialize the AptosLedgerClient with the transport
  const ledgerClient = new AptosLedgerClient(transport);

  return ledgerClient;
}

// Initializes a LedgerSigner object from a specific key (denoted by key index) on a Ledger hardware wallet.
export async function initLedgerSigner(ledgerIndex: number): Promise<LedgerSigner> {
  // If we already have an active signer for the same ledger index, return it
  if (activeSigner && activeLedgerIndex === ledgerIndex) {
    return activeSigner;
  }

  // If we have a signer for a different index, close it first
  if (activeSigner) {
    await activeSigner.close();
    activeSigner = null;
    activeLedgerIndex = null;
  }

  const ledgerClient = await initLedgerClient();
  const hdPath = getHDPath(ledgerIndex); // Example HD path for Aptos
  const publicKeyResponse = await ledgerClient.getAccount(hdPath, false);

  const signer = new LedgerSigner(
    ledgerClient,
    hdPath,
    publicKeyResponse.publicKey.toString('hex'),
    AccountAddress.fromString(publicKeyResponse.address)
  );

  // Store the active signer and index
  activeSigner = signer;
  activeLedgerIndex = ledgerIndex;

  return signer;
}

// TODO: use this?
// Converts a LedgerSigner object to an Aptos address
export function signerToAddress(signer: LedgerSigner) {
  // @ts-ignore
  return publicKeyToAddress(signer.publicKey.bcsToBytes().slice(1)).toString();
}

// Generates a Hierarchical Deterministic (HD) path for a specific key on a Ledger hardware wallet
// This path specifies which private key to use from the wallet’s internal hierarchy.
export function getHDPath(ledgerIndex: number): string {
  return `m/44'/637'/${ledgerIndex}'/0'/0'`;
}

export function getLedgerIndex(hdPath: string): number {
  return parseInt(hdPath.split('/')[3]);
}

// Terminates a LedgerClient connection.
// Note: Any time `initLedgerClient` is called, this method must be called to close the connection.
export async function closeLedger(signer: LedgerSigner) {
  await signer.close();

  // Clear singleton state if this was the active signer
  if (activeSigner === signer) {
    activeSigner = null;
    activeLedgerIndex = null;
  }
}
