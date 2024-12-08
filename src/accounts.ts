import { Account, Aptos, AptosConfig, Ed25519PrivateKey, Network } from '@aptos-labs/ts-sdk';
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

  // Return the account constructed from the private key
  return Account.fromPrivateKey({
    privateKey: new Ed25519PrivateKey(profileData.private_key),
  });
}
