import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command } from 'commander';
import { select } from '@inquirer/prompts';
import { fetchPendingTxns } from '../transactions.js';

export const registerPendingCommand = (program: Command) => {
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
      const network = program.getOptionValue('network') as Network;
      const aptos = new Aptos(new AptosConfig({ network }));

      try {
        console.log(chalk.blue(`Fetching pending transactions for multisig: ${options.multisig}`));
        const txns = await fetchPendingTxns(aptos, options.multisig, options.sequence_number);

        while (true) {
          const choices = txns.map((txn) => ({
            name: `#${txn.sequence_number} ${chalk.yellow(truncateString(txn.payload_decoded.function, 30))}`,
            value: txn.sequence_number.toString(),
          }));

          choices.push({
            name: 'Exit',
            value: 'quit',
          });

          const answer = await select({
            message: 'Select a pending transaction:',
            choices,
            pageSize: 20,
          });

          if (answer === 'quit') {
            break;
          }
          console.log(txns.find((txn) => txn.sequence_number.toString() === answer));
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
    });
};

// Helper function to truncate long strings
function truncateString(str: string, length: number): string {
  return str.length > length ? str.substring(0, length) + '...' : str;
}
