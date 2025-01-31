import { Command } from 'commander';
import { MultisigDefault } from '../storage.js';
import chalk from 'chalk';
import { validateAddress } from '../validators.js';

export const registerDefaultCommand = (program: Command) => {
  const defaults = program.command('defaults').description('Multisig default values');

  defaults
    .command('list')
    .description('List default multisig values')
    .action(async () => {
      let multisig = await MultisigDefault.get();

      if (!multisig) {
        console.log(chalk.yellow(`No default multisig address or sequence number found`));
        process.exit(1);
      }

      await MultisigDefault.set(multisig);
      console.log(JSON.stringify({ multisig }));
    });

  defaults
    .command('set')
    .description('Set default multisig values')
    .requiredOption('-m, --multisig <address>', 'Multisig address', validateAddress)
    .action(async (opts) => {
      const { multisig } = opts;

      if (multisig) {
        await MultisigDefault.set(multisig);
        console.log(JSON.stringify({ multisig }));
      }
    });

  defaults
    .command('remove')
    .description('Remove default multisig value')
    .action(async () => {
      await MultisigDefault.remove();
      console.log(chalk.green(`Removed default multisig address & sequence number`));
    });
};
