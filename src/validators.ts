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

export function validateSequenceNumber(value: string): number {
  const num = parseInt(value);
  if (isNaN(num) || num < 0) {
    console.error(chalk.red('Sequence number must be a non-negative integer'));
    process.exit(1);
  }
  return num;
}

export function validateApprove(value: string): boolean {
  if (value.toLowerCase() !== 'true' && value.toLowerCase() !== 'false') {
    console.error(chalk.red('Approve must be either "true" or "false"'));
    process.exit(1);
  }
  return value.toLowerCase() === 'true';
}

export function validateLedgerIndex(value: string): number {
  const num = parseInt(value);
  if (isNaN(num) || num < 0) {
    console.error(chalk.red('Ledger index must be a non-negative integer'));
    process.exit(1);
  }
  return num;
}

export function validateRequiredOptions(options: { profile?: string; ledgerIndex?: string }) {
  // Check if neither --profile nor --ledger is provided
  // @ts-ignore
  if (!options.profile && isNaN(options.ledgerIndex)) {
    throw new Error('You must specify either --profile or --ledgerIndex.');
  }

  return options;
}
