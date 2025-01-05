#!/usr/bin/env node

import { Command, Option } from 'commander';

import { registerAddressesCommand } from './commands/addresses.js';
import { registerDecodeCommand } from './commands/decode.js';
import { registerSummaryCommand } from './commands/summary.js';
import { registerSimulateCommand } from './commands/simulate.js';
import { registerEncodeCommand } from './commands/encode.js';
import { registerVoteCommand } from './commands/vote.js';
import { registerDocgenCommand } from './commands/docgen.js';
import { registerProposeCommand } from './commands/propose.js';
import { registerExecuteCommand } from './commands/execute.js';
import { registerProposalCommand } from './commands/proposal.js';
import { registerOwnersCommand } from './commands/owners.js';

const program = new Command();

program.name('safely').description('CLI tool for multisig management').version('0.0.1');
program.addOption(
  new Option('-n, --network <network>', 'network to use')
    .choices(['devnet', 'testnet', 'mainnet', 'custom'])
    .default('mainnet')
);

program.option('--fullnode <url>', 'Fullnode URL for custom network');

program.hook('preAction', (thisCommand) => {
  const options = thisCommand.opts();
  if (options.network === 'custom' && !options.fullnode) {
    throw new Error('When using a "custom" network, you must provide a --fullnode URL.');
  }
});

registerProposalCommand(program);
registerDecodeCommand(program);
registerEncodeCommand(program);
registerAddressesCommand(program);
registerSummaryCommand(program);
registerSimulateCommand(program);
registerVoteCommand(program);
registerDocgenCommand(program);
registerProposeCommand(program);
registerExecuteCommand(program);
registerOwnersCommand(program);
program.parse();
