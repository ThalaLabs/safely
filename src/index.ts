#!/usr/bin/env node

import { Command, Option } from 'commander';

import { registerPendingCommand } from './commands/pending.js';
import { registerAddressesCommand } from './commands/addresses.js';
import { registerExecutedCommand } from './commands/executed.js';
import { registerDecodeCommand } from './commands/decode.js';
import { registerSummaryCommand } from './commands/summary.js';
import { registerSimulateCommand } from './commands/simulate.js';
import { registerEncodeCommand } from './commands/encode.js';
import { registerVoteCommand } from './commands/vote.js';
import { registerDocgenCommand } from './commands/docgen.js';
import { registerProposeCommand } from './commands/propose.js';
import { registerExecuteCommand } from './commands/execute.js';

const program = new Command();

program.name('dontrust').description('CLI tool for Aptos multisig management').version('1.0.0');
program.addOption(
  new Option('-n, --network <network>', 'network to use')
    .choices(['devnet', 'testnet', 'mainnet'])
    .default('mainnet')
);

registerPendingCommand(program);
registerExecutedCommand(program);
registerDecodeCommand(program);
registerEncodeCommand(program);
registerAddressesCommand(program);
registerSummaryCommand(program);
registerSimulateCommand(program);
registerVoteCommand(program);
registerDocgenCommand(program);
registerProposeCommand(program);
registerExecuteCommand(program);

program.parse();
