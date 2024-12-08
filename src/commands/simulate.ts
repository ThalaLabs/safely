import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command } from 'commander';
import { MultisigTransaction, summarizeTransactionSimulation } from '../transactions.js';
import { decode } from '../parser.js';

export const registerSimulateCommand = (program: Command) => {
  program
    .command('simulate')
    .description('Simulate transaction for a multisig (ignoring signer thresholds)')
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
    .action(async (options: { multisig: string; sequence_number: number }) => {
      const network = program.getOptionValue('network') as Network;
      const aptos = new Aptos(new AptosConfig({ network }));

      try {
        console.log(
          chalk.blue(
            `Simulating pending transaction with sn ${options.sequence_number} for multisig: ${options.multisig}...`
          )
        );

        // 1. Log transaction that will be simulated
        const [txn] = await aptos.view<[MultisigTransaction]>({
          payload: {
            function: '0x1::multisig_account::get_transaction',
            functionArguments: [options.multisig, options.sequence_number],
          },
        });

        console.log(chalk.blue(`\nSimulating Transaction: `));

        // 2. Simulate transaction (ignoring vote thresholds)
        let txBytes = txn.payload.vec[0];
        let decodedTxn = await decode(aptos, txBytes);
        console.log(decodedTxn);

        const transactionToSimulate = await aptos.transaction.build.simple({
          sender: options.multisig,
          data: decodedTxn,
          withFeePayer: true,
        });

        // Simulate the transaction, skipping the public/auth key check for both the sender and the fee payer.
        const [simulateMultisigTx] = await aptos.transaction.simulate.simple({
          transaction: transactionToSimulate,
        });

        console.log(chalk.blue(`\nSimulation Result: `, simulateMultisigTx.success ? '✅' : '❌'));

        // 3. Display expected changes in human-readable form
        console.log(chalk.blue('\nExpected Changes:'));
        await summarizeTransactionSimulation(simulateMultisigTx.changes);
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
    });
};
