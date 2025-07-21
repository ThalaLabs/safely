import { closeLedger, getLedgerIndex, initLedgerSigner } from './ledger/ledger.js';
import {
  Account,
  AnyRawTransaction,
  Aptos,
  Ed25519PrivateKey,
  PrivateKey,
  PrivateKeyVariants,
} from '@aptos-labs/ts-sdk';
import LedgerSigner from './ledger/LedgerSigner.js';
import fs from 'fs';
import { parse } from 'yaml';
import { getConfigPath } from './utils.js';
import { NetworkChoice } from './constants.js';

export interface Profile {
  signer: Account | LedgerSigner;
  fullnode: string;
}

type ProfileData = {
  network: string;
  rest_url: string;
} & ({ private_key: string } | { derivation_path: string });

export async function loadProfile(
  profile: string,
  network: NetworkChoice,
  includeSigner = true
): Promise<Profile> {
  // Load from the network-specific config path
  const configPath = getConfigPath(network);

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found at ${configPath}`);
  }

  let profileData: ProfileData | undefined;

  try {
    const file = fs.readFileSync(configPath, 'utf8');
    const profiles: Record<string, ProfileData> = parse(file).profiles;
    profileData = profiles[profile];

    if (!profileData) {
      throw new Error(`Profile "${profile}" not found in ${configPath}`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('not found in')) {
      throw e;
    }
    throw new Error(`Failed to read config file at ${configPath}: ${e}`);
  }

  // Movement networks don't need the /v1 suffix
  const fullnode = network.startsWith('movement-')
    ? profileData.rest_url
    : profileData.rest_url + '/v1';

  if (!includeSigner) {
    // @ts-ignore
    return {
      fullnode,
    };
  }

  if ('private_key' in profileData) {
    return {
      fullnode,
      signer: Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(
          PrivateKey.formatPrivateKey(profileData.private_key, PrivateKeyVariants.Ed25519),
          true
        ),
      }),
    };
  } else {
    return {
      fullnode,
      signer: await initLedgerSigner(getLedgerIndex(profileData.derivation_path)),
    };
  }
}

export async function signAndSubmitTransaction(
  aptos: Aptos,
  signer: Account | LedgerSigner,
  txn: AnyRawTransaction
) {
  // Check if it's a LedgerSigner by looking for the close method which is unique to LedgerSigner
  if ('close' in signer) {
    return await signAndSubmitLedger(aptos, signer as LedgerSigner, txn);
  } else {
    return await signAndSubmitProfile(aptos, signer as Account, txn);
  }
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
