import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command } from 'commander';
import { loadAccount } from '../accounts.js';
import { validateMultisigAddress, validateSequenceNumber, validateApprove } from '../validators.js';

export const registerVoteCommand = (program: Command) => {
  program
    .command('vote')
    .description('Vote on a pending transaction')
    .requiredOption(
      '-m, --multisig-address <address>',
      'multisig account address',
      validateMultisigAddress
    )
    .requiredOption(
      '-s, --sequence-number <number>',
      'sequence number of transaction to vote on',
      validateSequenceNumber
    )
    .requiredOption('-a, --approve <boolean>', 'true to approve, false to reject', validateApprove)
    .requiredOption('-p, --profile <address>', 'profile name of voter', (value) => {
      return value;
    })
    .action(
      async (options: {
        multisigAddress: string;
        sequenceNumber: number;
        approve: boolean;
        profile: string;
      }) => {
        const network = program.getOptionValue('network') as Network;
        const aptos = new Aptos(new AptosConfig({ network }));

        try {
          console.log(
            chalk.blue(
              `Voting ${options.approve ? '✅' : '❌'} on transaction with sequence number ${
                options.sequenceNumber
              } for multisig: ${options.multisigAddress}`
            )
          );

          const account = loadAccount(options.profile);

          const txn = await aptos.transaction.build.simple({
            sender: account.accountAddress,
            data: {
              function: `0x1::multisig_account::vote_transaction`,
              functionArguments: [options.multisigAddress, options.sequenceNumber, options.approve],
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
