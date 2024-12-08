import { Account, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';
import fs from 'fs';
import { parse } from 'yaml';

export function loadAccount(profile: string): Account {
  const file = fs.readFileSync(`.aptos/config.yaml`, 'utf8');
  const profiles: Record<string, { private_key: string }> = parse(file).profiles;

  // Get the profile that matches the provided name
  const profileData = profiles[profile];
  if (!profileData) {
    throw new Error(`Profile "${profile}" not found".`);
  }

  // TODO: fix this
  // [Aptos SDK] It is recommended that private keys are AIP-80 compliant (https://github.com/aptos-foundation/AIPs/blob/main/aips/aip-80.md). You can fix the private key by formatting it with `PrivateKey.formatPrivateKey(privateKey: string, type: 'ed25519' | 'secp256k1'): string`.
  // Return the account constructed from the private key
  return Account.fromPrivateKey({
    privateKey: new Ed25519PrivateKey(profileData.private_key),
  });
}
