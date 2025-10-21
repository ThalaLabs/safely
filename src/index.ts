#!/usr/bin/env node

import { Command } from 'commander';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import chalk from 'chalk';

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
import { NetworkDefault, MultisigDefault, ProfileDefault } from './storage.js';
import { getFullnodeUrl } from './utils.js';
import { NetworkChoice } from './constants.js';

const program = new Command();

program
  .name('safely')
  .description(
    'CLI tool for multisig management\n\nPower user shortcut: use --default or -d to jump directly to proposals view using saved defaults'
  )
  .version(packageJson.version);

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

// Check for --default or -d flag before parsing
const hasDefaultFlag = process.argv.includes('--default') || process.argv.includes('-d');

if (hasDefaultFlag) {
  // Launch ProposalView with defaults
  (async () => {
    try {
      const [network, multisig, profile] = await Promise.all([
        NetworkDefault.get(),
        MultisigDefault.get(),
        ProfileDefault.get(),
      ]);

      // Validate required defaults
      const missing: string[] = [];
      if (!network) missing.push('Network');
      if (!multisig) missing.push('Multisig');

      if (missing.length > 0) {
        console.error(chalk.red('✗ Cannot use --default: missing configuration'));
        console.error(chalk.dim('  Required:'));
        console.error(
          `    Network:  ${network ? chalk.green('✓ ' + network) : chalk.red('✗ not set')}`
        );
        console.error(
          `    Multisig: ${multisig ? chalk.green('✓ ' + multisig.slice(0, 10) + '...' + multisig.slice(-6)) : chalk.red('✗ not set')}`
        );
        console.error(chalk.dim('  Optional:'));
        console.error(
          `    Profile:  ${profile ? chalk.green('✓ ' + profile) : chalk.dim('(read-only mode)')}`
        );
        console.error('');
        console.error(chalk.dim("Run 'safely' to configure interactively, or use:"));
        console.error(chalk.dim('  safely default set --network <network> --multisig <address>'));
        process.exit(1);
      }

      // At this point we know network and multisig are defined (validated above)
      const validatedNetwork = network as NetworkChoice;
      const validatedMultisig = multisig as string;

      // Get RPC endpoint and launch ProposalView
      const rpcEndpoint = getFullnodeUrl(validatedNetwork);

      // Import and launch ProposalView
      const { runProposalView } = await import('./ui/ProposalView.js');
      runProposalView({
        network: validatedNetwork,
        multisigAddress: validatedMultisig,
        profile,
        rpcEndpoint,
      });
    } catch (error) {
      console.error(chalk.red('Error loading defaults:'), error);
      process.exit(1);
    }
  })();
} else if (process.argv.length === 2) {
  // No arguments provided, launch UI
  import('./ui/HomeView.js').then(({ runHomeView }) => {
    runHomeView();
  });
} else {
  // Parse command line arguments normally
  program.parse();
}
