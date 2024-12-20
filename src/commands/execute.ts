import { Command } from 'commander';
import {
  Aptos,
  AptosConfig,
  generateRawTransaction,
  generateTransactionPayload,
  Network,
  SimpleTransaction,
} from '@aptos-labs/ts-sdk';
import { loadAccount } from '../accounts.js';
import { decode } from '../parser.js';
import chalk from 'chalk';
import { validateMultisigAddress, validateSequenceNumber, validateApprove } from '../validators.js';

export const registerExecuteCommand = (program: Command) => {
  program
    .command('execute')
    .description('Execute a multisig transaction')
    .requiredOption(
      '-m, --multisig-address <address>',
      'multisig account address',
      validateMultisigAddress
    )
    .requiredOption(
      '-s, --sequence-number <number>',
      'sequence number of transaction to execute',
      validateSequenceNumber
    )
    .requiredOption('-a, --approve <boolean>', 'true to approve, false to reject', validateApprove)
    .requiredOption('-p, --profile <profile>', 'Profile to use for the transaction')
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
          const sender = loadAccount(options.profile);

          let txnPayload;
          if (options.approve) {
            const [txnPayloadBytes] = await aptos.view<[string]>({
              payload: {
                function: '0x1::multisig_account::get_next_transaction_payload',
                functionArguments: [options.multisigAddress, '0x0'],
              },
            });
            const entryFunction = await decode(aptos, txnPayloadBytes);
            txnPayload = await generateTransactionPayload({
              multisigAddress: options.multisigAddress,
              ...entryFunction,
              aptosConfig: aptos.config,
            });
          } else {
            const [txnPayloadBytes] = await aptos.view<[string]>({
              payload: {
                function: '0x1::multisig_account::get_next_transaction_payload',
                functionArguments: [options.multisigAddress, '0x0'],
              },
            });
            const entryFunction = await decode(aptos, txnPayloadBytes);
            txnPayload = await generateTransactionPayload({
              multisigAddress: options.multisigAddress,
              ...entryFunction,
              aptosConfig: aptos.config,
            });
          }

          const rawTxn = await generateRawTransaction({
            sender: sender.accountAddress,
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
          const authenticator = aptos.transaction.sign({ signer: sender, transaction: txn });
          const response = await aptos.transaction.submit.simple({
            senderAuthenticator: authenticator,
            transaction: txn,
          });
          await aptos.waitForTransaction({ transactionHash: response.hash });
          console.log(
            chalk.green(
              `Transaction executed successfully: https://explorer.aptoslabs.com/txn/${response.hash}?network=${aptos.config.network}`
            )
          );
        } catch (error) {
          console.error(chalk.red(`Error: ${(error as Error).message}`));
        }
      }
    );
};
