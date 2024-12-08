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

      const docs = allCommands.map((command) => command.helpInformation()).join('\n--\n');

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
