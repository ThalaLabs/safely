import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import {
  Aptos,
  AptosConfig,
  generateTransactionPayload,
  Network,
  InputEntryFunctionData,
  MoveFunctionId,
  Account,
} from '@aptos-labs/ts-sdk';
import { decodeEntryFunction } from '../entryFunction.js';
import { loadAccount } from '../accounts.js';
import chalk from 'chalk';
import { validateMultisigAddress } from '../validators.js';

export const registerProposeCommand = (program: Command) => {
  const propose = program
    .command('propose')
    .description('Propose a new transaction for a multisig')
    .requiredOption(
      '-m, --multisig-address <address>',
      'multisig account address',
      validateMultisigAddress
    )
    .requiredOption('-p, --profile <profile>', 'Profile to use for the transaction');

  // Raw transaction from file
  propose
    .command('raw')
    .description('Propose a raw transaction from a payload file')
    .requiredOption('-f, --txn-payload-file <file>', 'Path to the transaction payload file')
    .action(async (options, cmd) => {
      const { multisigAddress, profile } = cmd.parent.opts();
      const { txnPayloadFile } = options;
      const network = program.getOptionValue('network') as Network;
      const aptos = new Aptos(new AptosConfig({ network }));

      try {
        if (!txnPayloadFile) {
          throw new Error('Must specify --txn-payload-file');
        }
        const fullPath = path.resolve(txnPayloadFile);
        if (!fs.existsSync(fullPath)) {
          throw new Error(`Transaction payload file not found: ${fullPath}`);
        }
        await proposeEntryFunction(
          aptos,
          loadAccount(profile),
          decodeEntryFunction(fullPath),
          multisigAddress
        );
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
    });

  // Predefined actions
  const predefined = propose
    .command('predefined')
    .description('Propose a predefined transaction type');

  // Transfer coins action
  predefined
    .command('transfer-coins')
    .description('Transfer coins to an address')
    .requiredOption('--coin-type <type>', 'Coin type')
    .requiredOption('--recipient <address>', 'Recipient address')
    .requiredOption('--amount <number>', 'Amount to transfer', Number)
    .action(async (options, cmd) => {
      const { multisigAddress, profile } = cmd.parent.parent.opts();
      const network = program.getOptionValue('network') as Network;
      const aptos = new Aptos(new AptosConfig({ network }));
      const entryFunction = {
        function: '0x1::aptos_account::transfer_coins' as MoveFunctionId,
        typeArguments: [options.coinType],
        functionArguments: [options.recipient, options.amount],
      };
      try {
        await proposeEntryFunction(aptos, loadAccount(profile), entryFunction, multisigAddress);
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
    });

  // Add other predefined actions here as subcommands
};

async function proposeEntryFunction(
  aptos: Aptos,
  sender: Account,
  entryFunction: InputEntryFunctionData,
  multisigAddress: string
) {
  const txnPayload = await generateTransactionPayload({
    multisigAddress,
    ...entryFunction,
    aptosConfig: aptos.config,
  });

  // simulate the actual txn
  const actualTxn = await aptos.transaction.build.simple({
    sender: multisigAddress,
    data: entryFunction,
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
      functionArguments: [multisigAddress, txnPayload.multiSig.transaction_payload!.bcsToBytes()],
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
  console.log(
    chalk.green(
      `Transaction proposed successfully: https://explorer.aptoslabs.com/txn/${proposeTxnResponse.hash}?network=${aptos.config.network}`
    )
  );
}
