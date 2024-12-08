import { Command } from 'commander';
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { decode } from '../parser.js';

export function registerDecodeCommand(program: Command) {
  program
    .command('decode')
    .description('Decode multisig transaction bytes')
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
    .action(async (options: { bytes: string }) => {
      const network = program.getOptionValue('network') as Network;
      const aptos = new Aptos(new AptosConfig({ network }));

      try {
        console.log(chalk.blue(`Decoding multisig payload: ${options.bytes}`));
        console.log(await decode(aptos, options.bytes));
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
    });
}
