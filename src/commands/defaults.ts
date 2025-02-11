import { Command, Option } from 'commander';
import {MultisigDefault, NetworkDefault} from '../storage.js';
import chalk from 'chalk';
import { validateAddress } from '../validators.js';

export const registerDefaultCommand = (program: Command) => {
  const defaults = program.command('defaults').description('Multisig default values');

  defaults
    .command('list')
    .description('List default multisig values')
    .action(async () => {
      let multisig = await MultisigDefault.get();
      let network = await NetworkDefault.get();

      if (!multisig && !network) {
        console.log(chalk.yellow(`No default multisig address or sequence number found`));
        process.exit(1);
      }

      console.log(JSON.stringify({ multisig, network }));
    });

  defaults
    .command('set')
    .description('Set default multisig values')
    .option('-m, --multisig <address>', 'Multisig address', validateAddress)
      .addOption(
          new Option('-n, --network <network>', 'network to use')
              .choices(['devnet', 'testnet', 'mainnet', 'custom'])
      )
    .action(async (opts) => {
      const { multisig, network } = opts;

      if (multisig) {
        await MultisigDefault.set(multisig);
        console.log(JSON.stringify({ multisig }));
      }

      if (network) {
          await NetworkDefault.set(network);
          console.log(JSON.stringify({ network }));
      }

    });

  defaults
    .command('remove')
    .description('Remove default multisig value')
    .action(async () => {
      await MultisigDefault.remove();
      await NetworkDefault.remove();
      console.log(chalk.green(`Removed default multisig address & network`));
    });
};
