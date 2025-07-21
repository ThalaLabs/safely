import { Command, Option } from 'commander';
import { Aptos, AptosConfig } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { decode } from '@thalalabs/multisig-utils';
import { ensureNetworkExists } from '../storage.js';
import { NETWORK_CHOICES, NetworkChoice } from '../constants.js';
import { getFullnodeUrl } from '../utils.js';

export function registerDecodeCommand(program: Command) {
  program
    .command('decode')
    .description('Decode multisig transaction bytes (experimental)')
    .requiredOption(
      '-b, --bytes <bytes>',
      'transaction bytes to decode (hex string starting with 0x)',
      (value) => {
        if (!value.startsWith('0x') || !/^0x[0-9a-fA-F]+$/.test(value)) {
          console.error(chalk.red('Error: bytes must be a hex string starting with 0x'));
          process.exit(1);
        }
        return value;
      }
    )
    .addOption(
      new Option('--network <network>', 'network to use').choices(NETWORK_CHOICES)
    )
    .addOption(new Option('--fullnode <url>', 'Fullnode URL for custom network'))
    .hook('preAction', (thisCommand) => {
      const options = thisCommand.opts();
      if (options.network === 'custom' && !options.fullnode) {
        throw new Error('When using a "custom" network, you must provide a --fullnode URL.');
      }
    })
    .action(async (options: { bytes: string; network: NetworkChoice; fullnode: string }) => {
      const network = await ensureNetworkExists(options.network);
      const aptos = new Aptos(
        new AptosConfig({
          fullnode: options.fullnode || getFullnodeUrl(network),
        })
      );

      try {
        console.log(chalk.blue(`Decoding multisig payload: ${options.bytes}`));
        console.log(await decode(aptos, options.bytes));
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
    });
}
