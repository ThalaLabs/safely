import chalk from 'chalk';

// TODO: use aip-80 address
export function validateAddress(value: string): string {
  if (!/^0x[0-9a-f]{64}$/i.test(value)) {
    console.error(chalk.red('Address must be 0x followed by 64 hex characters'));
    process.exit(1);
  }
  return value;
}

export function validateAddresses(value: string): string[] {
  return value ? value.split(',').map((addr) => validateAddress(addr.trim())) : [];
}

export function validateUInt(value: string): number {
  const num = parseInt(value);
  if (isNaN(num) || num < 0) {
    console.error(chalk.red('Value must be a non-negative integer'));
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
  console.error(chalk.red('Value must be true/false or 1/0'));
  process.exit(1);
}
