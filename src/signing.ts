import { closeLedger, getLedgerIndex, initLedgerSigner } from './ledger/ledger.js';
import {
  Account,
  AnyRawTransaction,
  Aptos,
  Ed25519PrivateKey,
  Network,
  PrivateKey,
  PrivateKeyVariants,
} from '@aptos-labs/ts-sdk';
import LedgerSigner from './ledger/LedgerSigner';
import fs from 'fs';
import { parse } from 'yaml';

export interface Profile {
  network: Network;
  signer: Account | LedgerSigner;
}

type ProfileData = {
  network: string;
} & ({ private_key: string } | { derivation_path: string });

export async function loadProfile(profile: string): Promise<Profile> {
  // TODO: allow specifying any config file
  const file = fs.readFileSync(`.aptos/config.yaml`, 'utf8');
  const profiles: Record<string, ProfileData> = parse(file).profiles;

  const profileData = profiles[profile];
  if (!profileData) {
    throw new Error(`Profile "${profile}" not found".`);
  }

  if ('private_key' in profileData) {
    return {
      network: profileData.network.toLowerCase() as Network,
      signer: Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(
          PrivateKey.formatPrivateKey(profileData.private_key, PrivateKeyVariants.Ed25519),
          true
        ),
      }),
    };
  } else {
    return {
      network: profileData.network.toLowerCase() as Network,
      signer: await initLedgerSigner(getLedgerIndex(profileData.derivation_path)),
    };
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
