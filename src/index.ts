#!/usr/bin/env node

import { Command } from 'commander';

import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import { registerPendingCommand } from './commands/pending.js';
import { registerAddressesCommand } from './commands/addresses.js';
import { registerExecutedCommand } from './commands/executed.js';
import { registerDecodeCommand } from './commands/decode.js';

const program = new Command();

const config = new AptosConfig({ network: Network.MAINNET });
const aptos = new Aptos(config);

program.name('dontrust').description('CLI tool for Aptos multisig management').version('1.0.0');

registerPendingCommand(program, aptos);
registerExecutedCommand(program, aptos);
registerDecodeCommand(program, aptos);
registerAddressesCommand(program);

program.parse();
