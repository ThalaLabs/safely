import { Command } from 'commander';
import { NetworkChoice } from '../constants.js';
import { loadLabels, saveLabels, mergeLabels, clearLabels } from '../labelConfig.js';
import chalk from 'chalk';
import fs from 'fs';

export function registerLabelCommand(program: Command) {
  const labelCommand = program.command('label').description('Manage address labels');

  labelCommand
    .command('apply')
    .description('Apply labels from a JSON file or stdin (merges with existing)')
    .argument('[file]', 'Path to JSON file containing labels (omit to read from stdin)')
    .requiredOption('-n, --network <network>', 'Network to apply labels to')
    .action(
      async (
        file: string | undefined,
        options: {
          network: NetworkChoice;
        }
      ) => {
        try {
          const network = options.network;

          // Read labels from file or stdin
          let labelsJson: string;
          if (file) {
            if (!fs.existsSync(file)) {
              throw new Error(`File not found: ${file}`);
            }
            labelsJson = fs.readFileSync(file, 'utf8');
          } else {
            // Read from stdin
            labelsJson = fs.readFileSync(0, 'utf8'); // fd 0 is stdin
          }

          // Parse JSON
          let newLabels: Record<string, string>;
          try {
            newLabels = JSON.parse(labelsJson);
          } catch (error) {
            throw new Error(`Invalid JSON: ${(error as Error).message}`);
          }

          // Validate format (should be object with string values)
          if (typeof newLabels !== 'object' || newLabels === null || Array.isArray(newLabels)) {
            throw new Error('Labels must be a JSON object mapping addresses to label strings');
          }

          for (const [key, value] of Object.entries(newLabels)) {
            if (typeof value !== 'string') {
              throw new Error(`Invalid label for ${key}: must be a string`);
            }
          }

          // Load existing labels and merge
          const existing = loadLabels(network);
          const merged = mergeLabels(existing, newLabels);

          // Save merged labels
          saveLabels(network, merged);

          const count = Object.keys(newLabels).length;
          const source = file || 'stdin';
          console.log(
            chalk.green(`Successfully applied ${count} label(s) from ${source} to ${network}`)
          );
        } catch (error) {
          console.error(chalk.red(`Error: ${(error as Error).message}`));
          process.exit(1);
        }
      }
    );

  labelCommand
    .command('list')
    .description('List all labels for a network')
    .requiredOption('-n, --network <network>', 'Network to list labels for')
    .action(async (options: { network: NetworkChoice }) => {
      try {
        const network = options.network;
        const labels = loadLabels(network);

        if (Object.keys(labels).length === 0) {
          console.log(chalk.yellow(`No labels found for ${network}`));
          console.log(
            chalk.dim(
              '\nInstall default labels: curl https://raw.githubusercontent.com/ThalaLabs/safely/main/labels/aptos-mainnet.json | safely label apply'
            )
          );
          return;
        }

        console.log(chalk.blue(`Labels for ${network}:`));
        console.log('');

        const entries = Object.entries(labels);

        // Find the longest label for padding
        const maxLabelLength = Math.max(...entries.map(([, label]) => label.length));
        const labelWidth = Math.min(maxLabelLength, 50); // Cap at 50 chars

        for (const [address, label] of entries) {
          // Pad label to align addresses
          const paddedLabel = label.padEnd(labelWidth);

          console.log(`${chalk.green(paddedLabel)}  ${chalk.dim(address)}`);
        }

        console.log('');
        console.log(chalk.dim(`Total: ${Object.keys(labels).length} label(s)`));
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  labelCommand
    .command('clear')
    .description('Remove all labels for a network')
    .requiredOption('-n, --network <network>', 'Network to clear labels for')
    .action(async (options: { network: NetworkChoice }) => {
      try {
        const network = options.network;

        clearLabels(network);

        console.log(chalk.green(`Successfully cleared all labels for ${network}`));
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
        process.exit(1);
      }
    });
}
