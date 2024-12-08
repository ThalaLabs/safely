import * as fs from 'node:fs';
import { Command } from 'commander';
import { Aptos } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { encode } from '../parser.js';

export function registerEncodeCommand(program: Command, aptos: Aptos) {
  program
    .command('encode')
    .description('Encode entry function payload')
    .requiredOption(
      '-f, --txn-payload-file <txn-payload-file>',
      'transaction payload file to encode',
      (value) => {
        // TODO: validate file exists
        return value;
      }
    )
    .action(async (options: { txnPayloadFile: string }) => {
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
    });
}
