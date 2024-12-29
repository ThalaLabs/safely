import { Account, AnyRawTransaction, Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command } from 'commander';
import {
  validateMultisigAddress,
  validateSequenceNumber,
  validateApprove,
  validateLedgerIndex,
  validateRequiredOptions,
} from '../validators.js';
import { initLedgerSigner, closeLedger } from '../ledger/ledger.js';
import { getSender, signAndSubmitLedger, signAndSubmitProfile } from '../signing.js';
import LedgerSigner from '../ledger/LedgerSigner';

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
    .option('-p, --profile <address>', 'profile name of voter', (value) => {
      return value;
    })
    .option(
      '-l, --ledgerIndex <ledgerIndex>',
      'Ledger index for the transaction',
      validateLedgerIndex
    )
    .hook('preAction', (thisCommand, actionCommand) => {
      const options = actionCommand.opts();
      validateRequiredOptions(options); // Validate options before proceeding
    })
    .action(
      async (options: {
        multisigAddress: string;
        sequenceNumber: number;
        approve: boolean;
        profile: string;
        ledgerIndex: number;
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

          let { signer, address } = await getSender(options);
          console.log(chalk.blue(`Signer address: ${address}`));

          const txn = await aptos.transaction.build.simple({
            sender: address,
            data: {
              function: `0x1::multisig_account::vote_transaction`,
              functionArguments: [options.multisigAddress, options.sequenceNumber, options.approve],
            },
          });

          // Handle signing and submission
          const pendingTxn = options.profile
            ? await signAndSubmitProfile(aptos, signer as Account, txn)
            : await signAndSubmitLedger(aptos, signer as LedgerSigner, txn, options.ledgerIndex);

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
