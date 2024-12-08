import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { Aptos, AptosConfig, generateTransactionPayload, Network } from '@aptos-labs/ts-sdk';
import { decodeEntryFunction } from '../entryFunction.js';
import { loadAccount } from '../accounts.js';
import chalk from 'chalk';

export function registerProposeCommand(program: Command) {
  program
    .command('propose')
    .description('Propose a multisig transaction')
    .requiredOption('-m, --multisig-address <multisig-address>', 'Multisig address')
    .requiredOption('-p, --profile <profile>', 'Profile to use for the transaction')
    .requiredOption('-f, --txn-payload-file <file>', 'Path to the transaction payload file')
    .action(
      async (options: { multisigAddress: string; profile: string; txnPayloadFile: string }) => {
        const network = program.getOptionValue('network') as Network;
        const aptos = new Aptos(new AptosConfig({ network }));

        try {
          const { multisigAddress, profile, txnPayloadFile } = options;
          const sender = loadAccount(profile);

          // Validate that the transaction payload file exists
          const fullPath = path.resolve(txnPayloadFile);
          if (!fs.existsSync(fullPath)) {
            throw new Error(`Transaction payload file not found: ${fullPath}`);
          }

          // Read and parse the transaction payload file
          const entryFunction = decodeEntryFunction(fullPath);

          const txnPayload = await generateTransactionPayload({
            multisigAddress,
            ...entryFunction,
            aptosConfig: aptos.config,
          });

          // simulate the actual txn
          const actualTxn = await aptos.transaction.build.simple({
            sender: multisigAddress,
            data: entryFunction,
            // withFeePayer: true,
          });

          const [actualTxnSimulation] = await aptos.transaction.simulate.simple({
            transaction: actualTxn,
          });

          if (!actualTxnSimulation.success) {
            throw new Error(`Actual txn simulation failed: ${actualTxnSimulation.vm_status}`);
          }

          // simulate the create_transaction txn
          const proposeTxn = await aptos.transaction.build.simple({
            sender: sender.accountAddress,
            data: {
              function: '0x1::multisig_account::create_transaction',
              functionArguments: [
                multisigAddress,
                txnPayload.multiSig.transaction_payload!.bcsToBytes(),
              ],
            },
          });

          const [proposeTxnSimulation] = await aptos.transaction.simulate.simple({
            transaction: proposeTxn,
          });

          if (!proposeTxnSimulation.success) {
            throw new Error(`Propose txn simulation failed: ${proposeTxnSimulation.vm_status}`);
          }

          const authenticator = aptos.transaction.sign({ signer: sender, transaction: proposeTxn });
          const proposeTxnResponse = await aptos.transaction.submit.simple({
            senderAuthenticator: authenticator,
            transaction: proposeTxn,
          });
          await aptos.waitForTransaction({ transactionHash: proposeTxnResponse.hash });
          console.log(chalk.green('Transaction proposed successfully'));
        } catch (error) {
          console.error('Error proposing transaction:', error);
          process.exit(1);
        }
      }
    );
}
