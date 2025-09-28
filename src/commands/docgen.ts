import { Command } from 'commander';
import { writeFileSync } from 'fs';
import { join } from 'path';

export function registerDocgenCommand(program: Command) {
  program
    .command('docgen')
    .description('Generate documentation for the CLI')
    .option('-o, --output <path>', 'Output file path')
    .action((options) => {
      const allCommands = getAllCommands(program)
        .slice(1) // Remove root program
        .filter((cmd) => cmd.name() !== 'docgen'); // Remove docgen command

      // Add documentation for the TUI entry point
      const tuiDoc = `## safely

Enter the Terminal User Interface (TUI) for interactive multisig management

\`\`\`
When no command is specified, safely launches an interactive terminal interface
that provides a menu-driven experience for managing multisigs.

Features:
  - Visual menu navigation
  - Interactive multisig management
  - Proposal viewing and voting
  - Account configuration
\`\`\``;

      const docs =
        tuiDoc +
        '\n\n' +
        allCommands
          .map((command) => {
            const helpText = command.helpInformation();
            const lines = helpText.split('\n').filter((line) => line.trim() !== '');
            const [fullCommand, description, ...options] = lines;
            const heading = fullCommand.replace('Usage: ', '## ');
            return `${heading}\n\n${description}\n\n\`\`\`\n${options.join('\n')}\n\`\`\``;
          })
          .join('\n\n') +
        '\n';

      if (options.output) {
        const outputPath = join(process.cwd(), options.output);
        writeFileSync(outputPath, docs, 'utf-8');
      } else {
        console.log(docs);
      }
    });
}

function getAllCommands(command: Command): Command[] {
  const commands: Command[] = [command];

  for (const subCommand of command.commands) {
    commands.push(...getAllCommands(subCommand));
  }

  return commands;
}
