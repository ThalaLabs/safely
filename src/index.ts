#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';

const program = new Command();

program
  .name('dontrust')
  .description('CLI description')
  .version('1.0.0');

program
  .command('hello')
  .description('Say hello')
  .argument('[name]', 'name to say hello to')
  .option('-u, --uppercase', 'convert to uppercase')
  .action(async (name, options) => {
    // If no name provided, prompt for it
    if (!name) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'What is your name?',
          default: 'world'
        }
      ]);
      name = answers.name;
    }

    const message = `Hello, ${name}!`;
    console.log(
      chalk.blue(options.uppercase ? message.toUpperCase() : message)
    );
  });

program.parse();