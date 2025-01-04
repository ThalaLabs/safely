import { closeLedger, getLedgerIndex, initLedgerSigner } from './ledger/ledger.js';
import {
  Account,
  AnyRawTransaction,
  Aptos,
  Ed25519PrivateKey,
  PrivateKey,
  PrivateKeyVariants,
} from '@aptos-labs/ts-sdk';
import LedgerSigner from './ledger/LedgerSigner';
import fs from 'fs';
import { parse } from 'yaml';

export async function loadAccount(profile: string): Promise<Account | LedgerSigner> {
  // TODO: allow specifying any config file
  const file = fs.readFileSync(`.aptos/config.yaml`, 'utf8');
  const profiles: Record<string, { private_key: string } | { derivation_path: string }> =
    parse(file).profiles;

  const profileData = profiles[profile];
  if (!profileData) {
    throw new Error(`Profile "${profile}" not found".`);
  }

  if ('private_key' in profileData) {
    return Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(
        PrivateKey.formatPrivateKey(profileData.private_key, PrivateKeyVariants.Ed25519),
        true
      ),
    });
  } else {
    const ledgerIndex = getLedgerIndex(profileData.derivation_path);
    return await initLedgerSigner(ledgerIndex);
  }
}

export async function signAndSubmitTransaction(
  aptos: Aptos,
  signer: Account | LedgerSigner,
  txn: AnyRawTransaction
) {
  return signer instanceof Account
    ? await signAndSubmitProfile(aptos, signer, txn)
    : await signAndSubmitLedger(aptos, signer, txn);
}

async function signAndSubmitProfile(aptos: Aptos, signer: Account, txn: AnyRawTransaction) {
  return await aptos.signAndSubmitTransaction({ signer, transaction: txn });
}

async function signAndSubmitLedger(aptos: Aptos, signer: LedgerSigner, txn: AnyRawTransaction) {
  const signedTxn = await signer.signTransaction(txn);
  await closeLedger(signer);

  return await aptos.transaction.submit.simple({
    transaction: txn,
    senderAuthenticator: signedTxn,
  });
}
