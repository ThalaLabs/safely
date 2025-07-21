import { Aptos, AptosConfig } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command, Option } from 'commander';
import { ensureMultisigAddressExists, ensureNetworkExists } from '../storage.js';
import { MultisigTransaction, summarizeTransactionBalanceChanges } from '@thalalabs/multisig-utils';
import { decode } from '@thalalabs/multisig-utils';
import { validateAddress, validateUInt } from '../validators.js';
import { NETWORK_CHOICES, NetworkChoice } from '../constants.js';
import { getFullnodeUrl } from '../utils.js';

export const registerSimulateCommand = (program: Command) => {
  program
    .command('simulate')
    .description('Simulate multisig transaction')
    .option('-m, --multisig-address <address>', 'multisig account address', validateAddress)
    .addOption(new Option('--network <network>', 'network to use').choices(NETWORK_CHOICES))
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
        sequenceNumber: number;
        fullnode?: string;
        multisigAddress?: string;
        network?: NetworkChoice;
      }) => {
        const multisig = await ensureMultisigAddressExists(options.multisigAddress);
        const network = await ensureNetworkExists(options.network);
        const aptos = new Aptos(
          new AptosConfig({
            fullnode: options.fullnode || getFullnodeUrl(network),
          })
        );

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

    // TODO: Display expected changes in sanitized format
    // 3. Display expected changes in human-readable form
    // console.log(chalk.blue('\nExpected Changes:'));
    // await summarizeTransactionSimulation(simulateMultisigTx.changes);

    // 4. Display balance changes in human-readable form
    console.log(chalk.blue('Expected Balance Changes:'));
    const table = await summarizeTransactionBalanceChanges(aptos, simulateMultisigTx.changes);
    console.log(table.toString());
  } catch (error) {
    console.error(chalk.red(`Error: ${(error as Error).message}`));
  }
}
