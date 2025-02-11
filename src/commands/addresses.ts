import { Command } from 'commander';
import { AddressBook } from '../storage.js';
import chalk from 'chalk';

export function registerAddressesCommand(program: Command) {
  const addressesCommand = program
    .command('addresses')
    .description('Manage the local address book (experimental)');

  addressesCommand
    .command('add')
    .description('Add a new alias and address to the local address book')
    .requiredOption<string>('--alias <alias>', 'Alias for the address', (value) =>
      value.trim().toLowerCase()
    )
    .requiredOption<string>('--address <address>', 'Hexadecimal address (e.g., 0xabc)', (value) => {
      const trimmed = value.trim();

      // Validate address format (must be a hexadecimal string starting with 0x)
      if (!trimmed.startsWith('0x') || !/^0x[0-9a-fA-F]+$/.test(trimmed)) {
        throw new Error('Address must be a valid hex string starting with 0x.');
      }
      return trimmed;
    })
    .action(async (options: { alias: string; address: string }) => {
      try {
        // Add alias and address to the storage
        await AddressBook.add(options.alias, options.address);
        console.log(chalk.green(`Successfully added: ${options.alias} -> ${options.address}`));
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
    });

  addressesCommand
    .command('list')
    .description('List all saved aliases and addresses')
    .action(async () => {
      try {
        const addressBook = await AddressBook.getAll();

        if (!addressBook || addressBook.length === 0) {
          console.log(chalk.yellow('No addresses found in the address book.'));
          return;
        }

        console.log(chalk.blue('Address Book:'));

        // Iterate through the addresses and print each alias-address pair
        addressBook.forEach(({ alias, address }, index) => {
          console.log(chalk.green(`${index + 1}. ${alias}: ${address}`));
        });
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
    });

  addressesCommand
    .command('remove')
    .description('Remove an alias from the local address book')
    .requiredOption<string>('--alias <alias>', 'Alias to remove', (value) =>
      value.trim().toLowerCase()
    )
    .action(async (options: { alias: string }) => {
      try {
        await AddressBook.remove(options.alias);
        console.log(chalk.green(`Successfully removed alias "${options.alias}".`));
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
    });
}
