#!/usr/bin/env node

import { Command } from 'commander';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

import { registerDecodeCommand } from './commands/decode.js';
import { registerSimulateCommand } from './commands/simulate.js';
import { registerEncodeCommand } from './commands/encode.js';
import { registerVoteCommand } from './commands/vote.js';
import { registerDocgenCommand } from './commands/docgen.js';
import { registerProposeCommand } from './commands/propose.js';
import { registerExecuteCommand } from './commands/execute.js';
import { registerProposalCommand } from './commands/proposal.js';
import { registerAccountCommand } from './commands/account.js';
import { registerDefaultCommand } from './commands/defaults.js';
import { registerLabelCommand } from './commands/label.js';

const program = new Command();

program.name('safely').description('CLI tool for multisig management').version(packageJson.version);

// important
registerAccountCommand(program);
registerProposeCommand(program);
registerVoteCommand(program);
registerExecuteCommand(program);
registerProposalCommand(program);
registerSimulateCommand(program);

// experimental
registerDecodeCommand(program);
registerEncodeCommand(program);
registerLabelCommand(program);
registerDefaultCommand(program);

// misc
registerDocgenCommand(program);

// If no arguments provided, launch the interactive UI
if (process.argv.length === 2) {
  // No arguments provided, launch UI
  import('./ui/HomeView.js').then(({ runHomeView }) => {
    runHomeView();
  });
} else {
  // Parse command line arguments normally
  program.parse();
}
