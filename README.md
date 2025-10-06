# safely <a style="margin-left:5px" href="https://www.npmjs.com/package/@thalalabs/safely"><img src="https://img.shields.io/npm/v/@thalalabs/safely?colorA=2c8af7&colorB=2c8af7&style=flat" alt="Version"></a>

Manage your multisig accounts on Aptos & Movement **safely** through a secure CLI interface.

## Quickstart

1. Install the CLI:

```bash
npm install -g @thalalabs/safely
```

2. Configure your Aptos profile (if not already done):

```bash
aptos init --profile <profile_name>
# or with Ledger hardware wallet
aptos init --ledger --profile <profile_name>
```

See [Aptos CLI docs](https://aptos.dev/en/build/cli/trying-things-on-chain/ledger) for more details.

3. Launch the interactive terminal UI:

```bash
safely
```

The interactive mode will guide you through:

- Selecting or entering a multisig address
- Choosing your profile for signing
- Viewing pending proposals
- Voting on or executing transactions

**This is the recommended way to use safely** - it provides a safe, guided experience with clear transaction details and simulation results.

For advanced usage and automation, see the [Subcommands](#subcommands) section below.

## Subcommands

**Note**: The interactive mode (`safely` without arguments) is the recommended way to interact with multisig accounts. Subcommands are provided for advanced users who need automation or scripting capabilities.

```bash
> safely --help
Usage: safely [options] [command]

CLI tool for multisig management

Options:
  -V, --version       output the version number
  -h, --help          display help for command

Commands:
  account             Multisig account operations
  propose [options]   Propose a new transaction for a multisig
  vote [options]      Vote on a pending transaction
  execute [options]   Execute a multisig transaction
  proposal [options]  List proposals for a multisig
  simulate [options]  Simulate multisig transaction
  decode [options]    Decode multisig transaction bytes (experimental)
  encode [options]    Encode entry function payload (experimental)
  addresses           Manage the local address book (experimental)
  default             Multisig default values
  docgen [options]    Generate documentation for the CLI
  help [command]      display help for command
```

For detailed subcommand documentation and examples, see [docs.md](./docs.md).

## Development

Want to contribute? Here's how to set up the development environment:

1. Fork the repository.

2. Install dependencies:

```bash
pnpm install
```

3. Build the project:

```bash
pnpm build
```

4. Link for local testing:

```bash
pnpm link -g
```

5. Format code:

```bash
pnpm format
```

6. Run in development mode:

```bash
pnpm start
```

## Community & Contributing

We welcome contributions from the entire Move ecosystem! Whether you're:

- A protocol developer adding transaction templates
- A developer improving core functionality
- A user reporting issues or suggesting features

Your input helps make multisig management safer and more efficient for everyone.

## Why safely?

In the wake of recent security incidents like the [SafeWallet frontend compromise](https://x.com/safe/status/1894768522720350673), it's become clear that web-based multisig interfaces pose significant risks. Web frontends can be modified by attackers, making transaction verification difficult or impossible for users. **safely** takes a different approach:

- **CLI-first**: No web frontend means no risk of compromised interfaces
- **Verifiable**: All transactions are transparent and can be inspected directly
- **Local Control**: All operations run locally on your machine
- **Transaction Simulation**: Display simulation results wherever possible
- **Human-Readable**: Clear transaction descriptions and parameter explanations
- **Multi-Chain**: Support for both Aptos and Movement
- **Hardware Security**: Native Ledger support
- **Open Source**: Community-driven development and quick iterations

## License

MIT.
