import { AccountAddress } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';

export function validateAddress(value: string): string {
  try {
    const accountAddress = AccountAddress.fromString(value);
    return accountAddress.toString();
  } catch (e) {
    console.error(chalk.red('Must be an aip-40 address'));
    process.exit(1);
  }
}

export function validateAddresses(value: string): string[] {
  return value ? value.split(',').map((addr) => validateAddress(addr.trim())) : [];
}

export function validateUInt(value: string): number {
  const num = parseInt(value);
  if (isNaN(num) || num < 0) {
    console.error(chalk.red('Must be a non-negative integer'));
    process.exit(1);
  }
  return num;
}

export function validateBool(value: string): boolean {
  const lowercaseValue = value.toLowerCase();
  if (lowercaseValue === 'true' || lowercaseValue === '1') {
    return true;
  }
  if (lowercaseValue === 'false' || lowercaseValue === '0') {
    return false;
  }
  console.error(chalk.red('Must be true/false or 1/0'));
  process.exit(1);
}

export function validateAsset(value: string): { type: 'coin' | 'fa'; address: string } {
  const regex = /^([a-f0-9]+)::[a-zA-Z0-9]+::[a-zA-Z0-9]+$/;
  if (regex.test(value)) {
    const [address] = value.split(':');
    validateAddress(address); // Validate the address portion
    return { type: 'coin', address: value };
  }
  return { type: 'fa', address: validateAddress(value) };
}
