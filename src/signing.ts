import { loadAccount } from './accounts.js';
import { closeLedger, initLedgerSigner, signerToAddress } from './ledger/ledger.js';
import { Account, AnyRawTransaction, Aptos } from '@aptos-labs/ts-sdk';
import LedgerSigner from './ledger/LedgerSigner';

// Pending Txns

export async function getSender(options: {
  profile: string;
  ledgerIndex: number;
}): Promise<{ signer: Account | LedgerSigner; address: string }> {
  const signer = options.profile
    ? loadAccount(options.profile)
    : await initLedgerSigner(options.ledgerIndex);

  // @ts-ignore
  const address = options.profile ? signer.accountAddress : signerToAddress(signer);

  if (!isNaN(options.ledgerIndex)) {
    await closeLedger(signer as LedgerSigner);
  }

  return {
    signer,
    address,
  };
}

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
  txn: AnyRawTransaction,
  ledgerIndex: number
) => {
  const signer_ledger = await initLedgerSigner(ledgerIndex);
  let signedTxn = await signer_ledger.signTransaction(txn);
  await closeLedger(signer_ledger);

  return await aptos.transaction.submit.simple({
    transaction: txn,
    senderAuthenticator: signedTxn,
  });
};
