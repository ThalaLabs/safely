# safely <a style="margin-left:5px" href="https://www.npmjs.com/package/@thalalabs/safely"><img src="https://img.shields.io/npm/v/@thalalabs/safely?colorA=2c8af7&colorB=2c8af7&style=flat" alt="Version"></a>

Manage your multisig accounts on Aptos & Movement **safely** through a secure CLI interface.

## Why safely?

In the wake of recent security incidents like the [SafeWallet frontend compromise](https://x.com/safe/status/1894768522720350673), it's become clear that web-based multisig interfaces pose significant risks. Web frontends can be modified by attackers, making transaction verification difficult or impossible for users. **safely** takes a different approach:

- **CLI-first**: No web frontend means no risk of compromised interfaces
- **Verifiable**: All transactions are transparent and can be inspected directly
- **Local execution**: Your keys stay on your machine

## Quickstart

1. Install the CLI:

```bash
npm install -g @thalalabs/safely
```

2. Under a directory where you have your aptos profiles configured, view pending transactions of a multisig account:

```bash
safely proposal -m <multisig_address> -p <profile_name>
```

Aptos profile can be configured by running `aptos init --profile <profile_name>` or `aptos init --ledger --profile <profile_name>` ([docs](https://aptos.dev/en/build/cli/trying-things-on-chain/ledger)).

3. Follow the terminal UI to view transaction details, vote yes, vote no, or execute the transaction once vote threshold is met.

See [docs.md](./docs.md) for detailed documentation.

## Key Features

- **Security First**: CLI-based interface eliminates frontend security risks
- **Transaction Simulation**: Display simulation results wherever possible
- **Human-Readable**: Clear transaction descriptions and parameter explanations
- **Open Source**: Community-driven development and quick iterations
- **Multi-Chain**: Support for both Aptos and Movement
- **Hardware Security**: Native Ledger support
- **Local Control**: All operations run locally on your machine

## Usage

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

For detailed usage instructions and examples, see [docs.md](./docs.md).

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

## Movement Compatibility

Safely works seamlessly with both Aptos and Movement networks. To use with Movement:

1. (Optional) Install the Movement CLI: https://docs.movementnetwork.xyz/devs/movementcli#options-2---install-through-brew

2. Initialize with your Ledger profile:

```bash
# Using Movement CLI
movement aptos init --ledger --profile <profile_name>

# OR using Aptos CLI
aptos init --ledger --profile <profile_name>
```

3. When prompted for network selection, choose:

```bash
Choose network from [devnet, testnet, mainnet, local, custom | defaults to devnet]
custom

Enter your rest endpoint [Current: None | No input: Exit (or keep the existing if present)]
https://mainnet.movementnetwork.xyz
```

## Community & Contributing

We welcome contributions from the entire Move ecosystem! Whether you're:

- A protocol developer adding transaction templates
- A developer improving core functionality
- A user reporting issues or suggesting features

Your input helps make multisig management safer and more efficient for everyone.

## License

MIT.
