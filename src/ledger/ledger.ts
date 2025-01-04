// Copyright © Aptos
// SPDX-License-Identifier: Apache-2.0

import TransportNodeHid from '@ledgerhq/hw-transport-node-hid';
import AptosLedgerClient, { publicKeyToAddress } from './AptosLedgerClient.js';
import LedgerSigner from './LedgerSigner.js';
import { AccountAddress } from '@aptos-labs/ts-sdk';

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
export async function initLedgerSigner(ledgerIndex: number = 0): Promise<LedgerSigner> {
  const ledgerClient = await initLedgerClient();
  const hdPath = getHDPath(ledgerIndex); // Example HD path for Aptos
  const publicKeyResponse = await ledgerClient.getAccount(hdPath);

  const signer = new LedgerSigner(
    ledgerClient,
    hdPath,
    publicKeyResponse.publicKey.toString('hex'),
    AccountAddress.fromString(publicKeyResponse.address)
  );

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
export function getHDPath(ledgerIndex: number) {
  return `m/44'/637'/${ledgerIndex}'/0'/0'`;
}

// Terminates a LedgerClient connection.
// Note: Any time `initLedgerClient` is called, this method must be called to close the connection.
export async function closeLedger(signer: LedgerSigner) {
  await signer.close();
}
