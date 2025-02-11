import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command, Option } from 'commander';
import { ensureMultisigAddressExists, ensureNetworkExists } from '../storage.js';
import { MultisigTransaction, summarizeTransactionSimulation } from '../transactions.js';
import { decode } from '../parser.js';
import { validateAddress, validateUInt } from '../validators.js';

export const registerSimulateCommand = (program: Command) => {
  program
    .command('simulate')
    .description('Simulate multisig transaction')
    .option('-m, --multisig-address <address>', 'multisig account address', validateAddress)
    .addOption(
      new Option('--network <network>', 'network to use')
        .choices(['devnet', 'testnet', 'mainnet', 'custom'])
    )
    .addOption(new Option('--fullnode <url>', 'Fullnode URL for custom network'))
    .hook('preAction', (thisCommand) => {
      const options = thisCommand.opts();
      if (options.network === 'custom' && !options.fullnode) {
        throw new Error('When using a "custom" network, you must provide a --fullnode URL.');
      }
    })
    .requiredOption(
      '-s, --sequence-number <number>',
      'fetch transaction with specific sequence number',
      validateUInt
    )
    .action(
      async (options: {
        fullnode: string;
        multisigAddress: string;
        network: Network;
        sequenceNumber: number;
      }) => {
        const network = await ensureNetworkExists(options.network);

        const aptos = new Aptos(
          new AptosConfig({
            network,
            ...(options.fullnode && { fullnode: options.fullnode }),
          })
        );

        const multisig = await ensureMultisigAddressExists(options.multisigAddress);

        try {
          console.log(
            chalk.blue(
              `Simulating pending transaction with sn ${options.sequenceNumber} for multisig: ${multisig}...`
            )
          );

          // 1. Log transaction that will be simulated
          const [txn] = await aptos.view<[MultisigTransaction]>({
            payload: {
              function: '0x1::multisig_account::get_transaction',
              functionArguments: [multisig, options.sequenceNumber],
            },
          });

          console.log(chalk.blue(`\nSimulating Transaction: `));

          // 2. Simulate transaction (ignoring vote thresholds)
          let txBytes = txn.payload.vec[0];

          let decodedTxn = await decode(aptos, txBytes);
          console.log(decodedTxn);

          const transactionToSimulate = await aptos.transaction.build.simple({
            sender: multisig,
            data: decodedTxn,
            withFeePayer: true,
          });

          console.log(transactionToSimulate);

          // Simulate the transaction, skipping the public/auth key check for both the sender and the fee payer.
          const [simulateMultisigTx] = await aptos.transaction.simulate.simple({
            transaction: transactionToSimulate,
          });

          console.log(
            chalk.blue(`\nSimulation Result: `, simulateMultisigTx.success ? '✅' : '❌')
          );

          // 3. Display expected changes in human-readable form
          console.log(chalk.blue('\nExpected Changes:'));
          await summarizeTransactionSimulation(simulateMultisigTx.changes);
        } catch (error) {
          console.error(chalk.red(`Error: ${(error as Error).message}`));
        }
      }
    );
};
