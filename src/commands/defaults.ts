import { Command, Option } from 'commander';
import { MultisigDefault, NetworkDefault, ProfileDefault } from '../storage.js';
import chalk from 'chalk';
import { validateAddress } from '../validators.js';
import { NETWORK_CHOICES } from '../constants.js';

export const registerDefaultCommand = (program: Command) => {
  const defaults = program.command('default').description('Multisig default values');

  defaults
    .command('list')
    .description('List default multisig values')
    .action(async () => {
      let multisig = await MultisigDefault.get();
      let network = await NetworkDefault.get();
      let profile = await ProfileDefault.get();

      if (!multisig && !network && !profile) {
        console.log(chalk.yellow(`No default multisig address, sequence number, or profile found`));
        process.exit(1);
      }

      console.log(JSON.stringify({ multisig, network, profile }));
    });

  defaults
    .command('set')
    .description('Set default multisig values')
    .option('-m, --multisig <address>', 'Multisig address', validateAddress)
    .addOption(
      new Option('-n, --network <network>', 'network to use').choices(NETWORK_CHOICES)
    )
    .option('-p, --profile <string>', 'Profile to use for transactions')
    .action(async (opts) => {
      const { multisig, network, profile } = opts;

      if (multisig) {
        await MultisigDefault.set(multisig);
      }

      if (network) {
        await NetworkDefault.set(network);
      }

      if (profile) {
        await ProfileDefault.set(profile);
      }

      console.log(JSON.stringify({ multisig, network, profile }));
    });

  defaults
    .command('remove')
    .description('Remove default multisig value')
    .action(async () => {
      await MultisigDefault.remove();
      await NetworkDefault.remove();
      await ProfileDefault.remove();
      console.log(chalk.green(`Removed default multisig address, network, and profile`));
    });
};
