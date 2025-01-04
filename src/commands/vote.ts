import { Account, AnyRawTransaction, Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command } from 'commander';
import { validateAddress, validateSequenceNumber, validateApprove } from '../validators.js';
import { loadAccount, signAndSubmitTransaction } from '../signing.js';

export const registerVoteCommand = (program: Command) => {
  program
    .command('vote')
    .description('Vote on a pending transaction')
    .requiredOption('-m, --multisig-address <address>', 'multisig account address', validateAddress)
    .requiredOption(
      '-s, --sequence-number <number>',
      'sequence number of transaction to vote on',
      validateSequenceNumber
    )
    .requiredOption('-a, --approve <boolean>', 'true to approve, false to reject', validateApprove)
    .requiredOption('-p, --profile <string>', 'profile name of voter')
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
          const signer = await loadAccount(options.profile);
          const txn = await aptos.transaction.build.simple({
            sender: signer.accountAddress,
            data: {
              function: `0x1::multisig_account::vote_transaction`,
              functionArguments: [options.multisigAddress, options.sequenceNumber, options.approve],
            },
          });

          // Handle signing and submission
          const pendingTxn = await signAndSubmitTransaction(aptos, signer, txn);
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
                `Vote nok ${vm_status}: https://explorer.aptoslabs.com/txn/${pendingTxn.hash}?network=${aptos.config.network}`
              )
            );
          }
        } catch (error) {
          console.error(chalk.red(`Error: ${(error as Error).message}`));
        }
      }
    );
};
