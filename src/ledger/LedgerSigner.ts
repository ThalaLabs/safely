// Copyright © Aptos
// SPDX-License-Identifier: Apache-2.0

import {
  generateSigningMessageForTransaction,
  Ed25519PublicKey,
  Ed25519Signature,
  AccountAuthenticatorEd25519,
  AnyRawTransaction,
  AccountAddress,
} from '@aptos-labs/ts-sdk';
import AptosLedgerClient from './AptosLedgerClient.js';

// A LedgerSigner object represents a signer for a private key on a Ledger hardware wallet.
// This object is initialized alongside a LedgerClient connection, and can be used to sign
// transactions via a ledger hardware wallet.
export default class LedgerSigner {
  public readonly publicKey: Ed25519PublicKey;
  public readonly accountAddress: AccountAddress;

  public constructor(
    private readonly ledgerClient: AptosLedgerClient,
    private readonly hdPath: string,
    publicKey: string,
    accountAddress: AccountAddress
  ) {
    this.publicKey = new Ed25519PublicKey(publicKey);
    this.accountAddress = accountAddress;
  }

  // Prompts user to sign associated transaction on their Ledger hardware wallet.
  async signTransaction(txn: AnyRawTransaction) {
    const signingMessage = generateSigningMessageForTransaction(txn);

    // This line prompts the user to sign the transaction on their Ledger hardware wallet
    const { signature } = await this.ledgerClient.signTransaction(
      this.hdPath,
      Buffer.from(signingMessage)
    );
    return new AccountAuthenticatorEd25519(this.publicKey, new Ed25519Signature(signature));
  }

  // Terminates the LedgerClient connection.
  async close() {
    await this.ledgerClient.transport.close();
  }
}
