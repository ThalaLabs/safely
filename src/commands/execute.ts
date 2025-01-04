import { Command } from 'commander';
import {
  Account,
  Aptos,
  AptosConfig,
  generateRawTransaction,
  generateTransactionPayload,
  Network,
  SimpleTransaction,
} from '@aptos-labs/ts-sdk';
import { decode } from '../parser.js';
import chalk from 'chalk';
import {
  validateAddress,
  validateApprove,
  validateLedgerIndex,
  validateRequiredOptions,
} from '../validators.js';
import { getSender, signAndSubmitLedger, signAndSubmitProfile } from '../signing.js';
import LedgerSigner from '../ledger/LedgerSigner.js';

export const registerExecuteCommand = (program: Command) => {
  program
    .command('execute')
    .description('Execute a multisig transaction')
    .requiredOption('-m, --multisig-address <address>', 'multisig account address', validateAddress)
    .requiredOption('-a, --approve <boolean>', 'true to approve, false to reject', validateApprove)
    .option('-p, --profile <profile>', 'Profile to use for the transaction')
    .option(
      '-l, --ledgerIndex <ledgerIndex>',
      'Ledger index for the transaction',
      validateLedgerIndex
    )
    .hook('preAction', (thisCommand, actionCommand) => {
      const options = actionCommand.opts();
      validateRequiredOptions(options);
    })
    .action(
      async (options: {
        multisigAddress: string;
        approve: boolean;
        profile: string;
        ledgerIndex: number;
      }) => {
        const network = program.getOptionValue('network') as Network;
        const aptos = new Aptos(new AptosConfig({ network }));

        try {
          // Get next transaction payload bytes
          const [txnPayloadBytes] = await aptos.view<[string]>({
            payload: {
              function: '0x1::multisig_account::get_next_transaction_payload',
              functionArguments: [options.multisigAddress, '0x0'],
            },
          });

          // Decode payload bytes into entry function
          const entryFunction = await decode(aptos, txnPayloadBytes);

          // Generate transaction payload
          const txnPayload = await generateTransactionPayload({
            multisigAddress: options.multisigAddress,
            ...entryFunction,
            aptosConfig: aptos.config,
          });

          const { signer, address } = await getSender(options);
          console.log(chalk.blue(`Signer address: ${address}`));

          // Simulate transaction
          const rawTxn = await generateRawTransaction({
            sender: address,
            payload: txnPayload,
            aptosConfig: aptos.config,
          });
          const txn = new SimpleTransaction(rawTxn);
          const [simulation] = await aptos.transaction.simulate.simple({
            transaction: txn,
          });
          if (!simulation.success) {
            throw new Error(`Transaction simulation failed: ${simulation.vm_status}`);
          }

          // Sign & Submit transaction
          const pendingTxn = options.profile
            ? await signAndSubmitProfile(aptos, signer as Account, txn)
            : await signAndSubmitLedger(aptos, signer as LedgerSigner, txn, options.ledgerIndex);

          await aptos.waitForTransaction({ transactionHash: pendingTxn.hash });
          console.log(
            chalk.green(
              `Transaction executed successfully: https://explorer.aptoslabs.com/txn/${pendingTxn.hash}?network=${aptos.config.network}`
            )
          );
        } catch (error) {
          console.error(chalk.red(`Error: ${(error as Error).message}`));
        }
      }
    );
};
