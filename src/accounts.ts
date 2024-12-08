import { Account, Ed25519PrivateKey, PrivateKey, PrivateKeyVariants } from '@aptos-labs/ts-sdk';
import fs from 'fs';
import { parse } from 'yaml';

export function loadAccount(profile: string): Account {
  // TODO: allow specifying any config file
  const file = fs.readFileSync(`.aptos/config.yaml`, 'utf8');
  const profiles: Record<string, { private_key: string }> = parse(file).profiles;

  // Get the profile that matches the provided name
  const profileData = profiles[profile];
  if (!profileData) {
    throw new Error(`Profile "${profile}" not found".`);
  }

  return Account.fromPrivateKey({
    privateKey: new Ed25519PrivateKey(
      PrivateKey.formatPrivateKey(profileData.private_key, PrivateKeyVariants.Ed25519),
      true
    ),
  });
}
