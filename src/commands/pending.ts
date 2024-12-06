import { Aptos } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command } from 'commander';
import { fetchPendingTxns } from '../transactions.js';

export const registerPendingCommand = (program: Command, aptos: Aptos) => {
  program
    .command('pending')
    .description('Get pending transaction(s) for a multisig')
    .requiredOption('-m, --multisig <address>', 'multisig contract address', (value) => {
      if (!/^0x[0-9a-f]{64}$/i.test(value)) {
        console.error(chalk.red('Multisig address must be 0x followed by 64 hex characters'));
        process.exit(1);
      }
      return value;
    })
    .option(
      '-s, --sequence_number <number>',
      'fetch transaction with specific sequence number',
      (value) => {
        const num = parseInt(value);
        if (isNaN(num) || num < 0) {
          console.error(chalk.red('Sequence number must be a non-negative integer'));
          process.exit(1);
        }
        return num;
      }
    )
    .action(async (options: { multisig: string; sequence_number?: number }) => {
      try {
        console.log(chalk.blue(`Fetching pending transactions for multisig: ${options.multisig}`));
        let txns = await fetchPendingTxns(aptos, options.multisig, options.sequence_number);
        for (const txn of txns) {
          console.log(txn);
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
    });
};
