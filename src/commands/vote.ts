import { Aptos } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command } from 'commander';
import { voteTransaction } from '../transactions.js';

export const registerVoteCommand = (program: Command, aptos: Aptos) => {
  const voteCommand = program.command('vote').description('Vote on pending transaction');

  voteCommand
    .command('approve')
    .description('Approve pending transaction for a multisig')
    .requiredOption('-m, --multisig <address>', 'multisig contract address', (value) => {
      if (!/^0x[0-9a-f]{64}$/i.test(value)) {
        console.error(chalk.red('Multisig address must be 0x followed by 64 hex characters'));
        process.exit(1);
      }
      return value;
    })
    .requiredOption(
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
    .requiredOption('-p, --profile <address>', 'profile name of voter', (value) => {
      return value;
    })
    .action(async (options: { multisig: string; sequence_number: number; profile: string }) => {
      try {
        console.log(
          chalk.blue(
            `Approving transaction with sequence number ${options.sequence_number} for multisig: ${options.multisig}`
          )
        );

        await voteTransaction(
          aptos,
          options.multisig,
          options.sequence_number,
          options.profile,
          true
        );
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
    });

  voteCommand
    .command('reject')
    .description('Reject pending transaction for a multisig')
    .requiredOption('-m, --multisig <address>', 'multisig contract address', (value) => {
      if (!/^0x[0-9a-f]{64}$/i.test(value)) {
        console.error(chalk.red('Multisig address must be 0x followed by 64 hex characters'));
        process.exit(1);
      }
      return value;
    })
    .requiredOption(
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
    .requiredOption('-p, --profile <address>', 'profile name of voter', (value) => {
      return value;
    })
    .action(async (options: { multisig: string; sequence_number: number; profile: string }) => {
      try {
        console.log(
          chalk.blue(
            `Rejecting transaction with sequence number ${options.sequence_number} for multisig: ${options.multisig}`
          )
        );

        await voteTransaction(
          aptos,
          options.multisig,
          options.sequence_number,
          options.profile,
          false
        );
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
    });
};
