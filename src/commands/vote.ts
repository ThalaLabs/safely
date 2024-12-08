import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command } from 'commander';
import { loadAccount } from '../accounts.js';

export const registerVoteCommand = (program: Command) => {
  program
    .command('vote')
    .description('Vote on a pending transaction')
    .requiredOption('-m, --multisig <address>', 'multisig contract address', (value) => {
      if (!/^0x[0-9a-f]{64}$/i.test(value)) {
        console.error(chalk.red('Multisig address must be 0x followed by 64 hex characters'));
        process.exit(1);
      }
      return value;
    })
    .requiredOption(
      '-s, --sequence_number <number>',
      'sequence number of transaction to vote on',
      (value) => {
        const num = parseInt(value);
        if (isNaN(num) || num < 0) {
          console.error(chalk.red('Sequence number must be a non-negative integer'));
          process.exit(1);
        }
        return num;
      }
    )
    .requiredOption('-a, --approve <boolean>', 'true to approve, false to reject', (value) => {
      if (value.toLowerCase() !== 'true' && value.toLowerCase() !== 'false') {
        console.error(chalk.red('Approve must be either "true" or "false"'));
        process.exit(1);
      }
      return value.toLowerCase() === 'true';
    })
    .requiredOption('-p, --profile <address>', 'profile name of voter', (value) => {
      return value;
    })
    .action(
      async (options: {
        multisig: string;
        sequence_number: number;
        approve: boolean;
        profile: string;
      }) => {
        const network = program.getOptionValue('network') as Network;
        const aptos = new Aptos(new AptosConfig({ network }));

        try {
          console.log(
            chalk.blue(
              `Voting ${options.approve ? '✅' : '❌'} on transaction with sequence number ${
                options.sequence_number
              } for multisig: ${options.multisig}`
            )
          );

          const account = loadAccount(options.profile);

          const txn = await aptos.transaction.build.simple({
            sender: account.accountAddress,
            data: {
              function: `0x1::multisig_account::vote_transaction`,
              functionArguments: [options.multisig, options.sequence_number, options.approve],
            },
          });

          const pendingTxn = await aptos.signAndSubmitTransaction({
            signer: account,
            transaction: txn,
          });

          const { success, vm_status } = await aptos.waitForTransaction({
            transactionHash: pendingTxn.hash,
          });

          if (success) {
            console.log(
              chalk.blue(
                `Vote ok: https://explorer.aptoslabs.com/txn/${pendingTxn.hash}?network=${aptos.config.network}`
              )
            );
          } else {
            console.log(
              chalk.red(
                `Vote error ${vm_status}: https://explorer.aptoslabs.com/txn/${pendingTxn.hash}?network=${aptos.config.network}`
              )
            );
          }
        } catch (error) {
          console.error(chalk.red(`Error: ${(error as Error).message}`));
        }
      }
    );
};
