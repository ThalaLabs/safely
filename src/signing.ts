import { closeLedger } from './ledger/ledger.js';
import { Account, AnyRawTransaction, Aptos } from '@aptos-labs/ts-sdk';
import LedgerSigner from './ledger/LedgerSigner.js';

export { loadProfile } from './profiles.js';

export async function signAndSubmitTransaction(
  aptos: Aptos,
  signer: Account | LedgerSigner,
  txn: AnyRawTransaction
) {
  // Check if it's a LedgerSigner by looking for the close method which is unique to LedgerSigner
  if ('close' in signer) {
    const signedTxn = await signer.signTransaction(txn);
    await closeLedger(signer);

    return await aptos.transaction.submit.simple({
      transaction: txn,
      senderAuthenticator: signedTxn,
    });
  } else {
    return await aptos.signAndSubmitTransaction({ signer, transaction: txn });
  }
}
