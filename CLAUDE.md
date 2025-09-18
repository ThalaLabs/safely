# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Run in development mode (auto-restarts)
pnpm start

# Format code with Prettier
pnpm format

# Generate documentation from CLI commands
pnpm docgen

# Link for local testing
pnpm link -g

# Run E2E tests
bash tests/e2e/run.sh
```

## High-Level Architecture

### Core Structure

The project is a CLI tool for managing Aptos/Movement multisig accounts, built with TypeScript and Commander.js.

1. **Entry Point**: `src/index.ts` - Registers all commands and initializes the CLI
2. **Commands**: `src/commands/` - Each file implements a specific CLI command
   - `account.ts` - Multisig account creation, updates, and info
   - `propose.ts` - Submit new transactions to multisigs
   - `vote.ts` - Vote on pending transactions
   - `execute.ts` - Execute approved transactions
   - `proposal.ts` - List and view pending proposals
   - `simulate.ts` - Simulate transactions before execution

3. **Core Modules**:
   - `transactions.ts` - Transaction building, simulation, and submission logic
   - `signing.ts` - Handles transaction signing with Account or Ledger
   - `storage.ts` - Local database for address book and defaults (using lowdb)
   - `utils.ts` - Network configuration, explorer URLs, and helpers
   - `validators.ts` - Input validation functions
   - `entryFunction.ts` - Handles ABI decoding and display

4. **Ledger Integration**: `src/ledger/` - Hardware wallet support
   - `LedgerSigner.ts` - Custom signer implementation
   - `AptosLedgerClient.ts` - Low-level Ledger communication

### Key Design Patterns

1. **Network Abstraction**: Supports multiple networks (Aptos mainnet/testnet/devnet, Movement mainnet/testnet) with custom fullnode URLs
2. **Profile System**: Integrates with Aptos CLI profiles for key management
3. **Interactive UI**: Uses @inquirer/prompts for user-friendly terminal interactions
4. **Transaction Safety**: Always simulates transactions before proposing/executing
5. **Readable Output**: Uses chalk for colored output and native string formatting for tables

### Dependencies

- `@aptos-labs/ts-sdk` - Aptos blockchain interaction
- `@thalalabs/multisig-utils` - Multisig-specific utilities
- `commander` - CLI framework
- `@inquirer/prompts` - Interactive prompts
- `@ledgerhq/*` - Ledger hardware wallet support

## Development Tips

- TypeScript strict mode is enabled - ensure proper type annotations
- The project uses ES modules (type: "module" in package.json)
- Node.js >=20 and pnpm >=9 are required
- When adding new commands, register them in `src/index.ts`
- Transaction simulation is critical for safety - respect the `--ignore-simulate` flag carefully
