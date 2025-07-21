import * as fs from 'node:fs';
import { Command, Option } from 'commander';
import { Aptos, AptosConfig } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { encode } from '@thalalabs/multisig-utils';
import { ensureNetworkExists } from '../storage.js';
import { NETWORK_CHOICES, NetworkChoice } from '../constants.js';
import { getFullnodeUrl } from '../utils.js';

export function registerEncodeCommand(program: Command) {
  program
    .command('encode')
    .description('Encode entry function payload (experimental)')
    .requiredOption(
      '-f, --txn-payload-file <txn-payload-file>',
      'transaction payload file to encode',
      (value) => {
        // TODO: validate file exists
        return value;
      }
    )
    .addOption(new Option('--network <network>', 'network to use').choices(NETWORK_CHOICES))
    .addOption(new Option('--fullnode <url>', 'Fullnode URL for custom network'))
    .hook('preAction', (thisCommand) => {
      const options = thisCommand.opts();
      if (options.network === 'custom' && !options.fullnode) {
        throw new Error('When using a "custom" network, you must provide a --fullnode URL.');
      }
    })
    .action(
      async (options: { txnPayloadFile: string; network: NetworkChoice; fullnode: string }) => {
        const network = await ensureNetworkExists(options.network);
        const aptos = new Aptos(
          new AptosConfig({
            fullnode: options.fullnode || getFullnodeUrl(network),
          })
        );
        try {
          console.log(chalk.blue(`Encoding transaction payload: ${options.txnPayloadFile}`));
          // TODO: verify the file is a valid json with function_id, type_args, and args
          const txnPayload = JSON.parse(fs.readFileSync(options.txnPayloadFile, 'utf8'));
          console.log(
            (
              await encode(aptos, txnPayload.function_id, txnPayload.type_args, txnPayload.args)
            ).toString()
          );
        } catch (error) {
          console.error(chalk.red(`Error: ${(error as Error).message}`));
        }
      }
    );
}
