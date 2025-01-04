import { loadAccount } from './accounts.js';
import { closeLedger, initLedgerSigner } from './ledger/ledger.js';
import { Account, AnyRawTransaction, Aptos } from '@aptos-labs/ts-sdk';
import LedgerSigner from './ledger/LedgerSigner';

// Pending Txns

export async function getSender(options: {
  profile: string;
  ledgerIndex: number;
}): Promise<Account | LedgerSigner> {
  return options.profile
    ? loadAccount(options.profile)
    : await initLedgerSigner(options.ledgerIndex);
}

export const signAndSubmitTransaction = async (
  aptos: Aptos,
  signer: Account | LedgerSigner,
  txn: AnyRawTransaction
) => {
  return signer instanceof Account
    ? await signAndSubmitProfile(aptos, signer, txn)
    : await signAndSubmitLedger(aptos, signer, txn);
};

export const signAndSubmitProfile = async (
  aptos: Aptos,
  signer: Account,
  txn: AnyRawTransaction
) => {
  return await aptos.signAndSubmitTransaction({ signer, transaction: txn });
};

export const signAndSubmitLedger = async (
  aptos: Aptos,
  signer: LedgerSigner,
  txn: AnyRawTransaction
) => {
  const signedTxn = await signer.signTransaction(txn);
  await closeLedger(signer);

  return await aptos.transaction.submit.simple({
    transaction: txn,
    senderAuthenticator: signedTxn,
  });
};
