import { Aptos } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command, Option } from 'commander';
import { ensureMultisigAddressExists, ensureNetworkExists } from '../storage.js';
import { MultisigTransaction } from '../transactions.js';
import { decode } from '../parser.js';
import { getBalanceChangesData } from '../utils.js';
import { validateAddress, validateUInt } from '../validators.js';
import { NETWORK_CHOICES, NetworkChoice } from '../constants.js';
import { initAptos } from '../utils.js';

export const registerSimulateCommand = (program: Command) => {
  program
    .command('simulate')
    .description('Simulate multisig transaction')
    .option('-m, --multisig-address <address>', 'multisig account address', validateAddress)
    .addOption(new Option('--network <network>', 'network to use').choices(NETWORK_CHOICES))
    .addOption(new Option('--fullnode <url>', 'Fullnode URL override'))
    .requiredOption(
      '-s, --sequence-number <number>',
      'fetch transaction with specific sequence number',
      validateUInt
    )
    .action(
      async (options: {
        sequenceNumber: number;
        fullnode?: string;
        multisigAddress?: string;
        network?: NetworkChoice;
      }) => {
        const multisig = await ensureMultisigAddressExists(options.multisigAddress);
        const network = await ensureNetworkExists(options.network);
        const aptos = initAptos(network, options.fullnode);

        await handleSimulateCommand(aptos, multisig, options.sequenceNumber);
      }
    );
};

export async function handleSimulateCommand(
  aptos: Aptos,
  multisig: string,
  sequenceNumber: number
) {
  try {
    console.log(
      chalk.blue(
        `Simulating pending transaction with sn ${sequenceNumber} for multisig: ${multisig}...`
      )
    );

    // 1. Log transaction that will be simulated
    const [txn] = await aptos.view<[MultisigTransaction]>({
      payload: {
        function: '0x1::multisig_account::get_transaction',
        functionArguments: [multisig, sequenceNumber],
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

    console.log(chalk.blue(`\nSimulation Result: `, simulateMultisigTx.success ? '✅' : '❌'));

    // 4. Display simulation status and balance changes
    if (!simulateMultisigTx.success) {
      console.log(chalk.red(`\nSimulation failed with VM status: ${simulateMultisigTx.vm_status}`));
    } else {
      console.log(chalk.green('\nSimulation succeeded'));

      // Display balance changes
      try {
        const balanceChanges = await getBalanceChangesData(aptos, simulateMultisigTx.changes);
        if (balanceChanges.length > 0) {
          console.log(chalk.blue('\nExpected Balance Changes:'));
          for (const change of balanceChanges) {
            const diff = change.balanceAfter - change.balanceBefore;
            const sign = diff >= 0 ? '+' : '';
            const color = diff >= 0 ? chalk.green : chalk.red;
            console.log(
              `  ${chalk.gray(change.address.slice(0, 6) + '...' + change.address.slice(-4))}: ` +
                `${change.balanceBefore} → ${change.balanceAfter} ${change.symbol} ` +
                `(${color(sign + diff.toFixed(4))})`
            );
          }
        } else {
          console.log(chalk.gray('\nNo balance changes detected'));
        }
      } catch (error) {
        // If balance changes can't be fetched, just show success message
        console.log(chalk.blue('Transaction would execute successfully if approved.'));
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${(error as Error).message}`));
  }
}
