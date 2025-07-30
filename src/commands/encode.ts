import { Command, Option } from 'commander';
import { Aptos, AptosConfig } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { encode } from '@thalalabs/multisig-utils';
import { ensureNetworkExists } from '../storage.js';
import { NETWORK_CHOICES, NetworkChoice } from '../constants.js';
import { getFullnodeUrl, resolvePayloadInput } from '../utils.js';

export function registerEncodeCommand(program: Command) {
  program
    .command('encode')
    .description('Encode entry function payload (experimental)')
    .requiredOption(
      '--payload <payload>',
      'Transaction payload (file path, JSON string, or - for stdin)'
    )
    .addOption(new Option('--network <network>', 'network to use').choices(NETWORK_CHOICES))
    .addOption(new Option('--fullnode <url>', 'Fullnode URL for custom network'))
    .addHelpText(
      'after',
      `
Examples:
  # From file
  $ safely encode --payload payload.json --network aptos-testnet
  
  # Direct JSON string
  $ safely encode --payload '{"function_id":"0x1::coin::transfer","type_args":["0x1::aptos_coin::AptosCoin"],"args":["0x123",1000]}' --network aptos-testnet
  
  # From stdin
  $ echo '{"function_id":"0x1::coin::transfer","type_args":["0x1::aptos_coin::AptosCoin"],"args":["0x123",1000]}' | safely encode --payload - --network aptos-testnet`
    )
    .hook('preAction', (thisCommand) => {
      const options = thisCommand.opts();
      if (options.network === 'custom' && !options.fullnode) {
        throw new Error('When using a "custom" network, you must provide a --fullnode URL.');
      }
    })
    .action(async (options: { payload: string; network: NetworkChoice; fullnode: string }) => {
      const network = await ensureNetworkExists(options.network);
      const aptos = new Aptos(
        new AptosConfig({
          fullnode: options.fullnode || getFullnodeUrl(network),
        })
      );
      try {
        console.log(chalk.blue(`Encoding transaction payload...`));
        const jsonContent = await resolvePayloadInput(options.payload);
        const txnPayload = JSON.parse(jsonContent);
        console.log(
          (
            await encode(aptos, txnPayload.function_id, txnPayload.type_args, txnPayload.args)
          ).toString()
        );
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
    });
}
