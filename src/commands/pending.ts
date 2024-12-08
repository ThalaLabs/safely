import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command } from 'commander';
import { select } from '@inquirer/prompts';
import { fetchPendingTxns } from '../transactions.js';
import { validateMultisigAddress, validateSequenceNumber } from '../validators.js';

export const registerPendingCommand = (program: Command) => {
  program
    .command('pending')
    .description('List pending transactions for a multisig')
    .requiredOption(
      '-m, --multisig-address <address>',
      'multisig account address',
      validateMultisigAddress
    )
    .option(
      '-s, --sequence-number <number>',
      'fetch transaction with specific sequence number',
      validateSequenceNumber
    )
    .action(async (options: { multisigAddress: string; sequenceNumber?: number }) => {
      const network = program.getOptionValue('network') as Network;
      const aptos = new Aptos(new AptosConfig({ network }));

      try {
        console.log(
          chalk.blue(`Fetching pending transactions for multisig: ${options.multisigAddress}`)
        );
        const txns = await fetchPendingTxns(aptos, options.multisigAddress, options.sequenceNumber);

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
