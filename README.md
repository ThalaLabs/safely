# safely <a style="margin-left:5px" href="https://www.npmjs.com/package/@thalalabs/safely"><img src="https://img.shields.io/npm/v/@thalalabs/safely?colorA=2c8af7&colorB=2c8af7&style=flat" alt="Version"></a>

Manage your multisig accounts on Aptos & Movement **safely**.

## Background

Multisig smart contracts are natively built into Aptos framework which gives Aptos users an edge over other chains.

However, managing multisig on Aptos is hard. We find some issues with the existing solutions:

1. Product development has been kept internally within teams building multisig products, and we see slow feature iteration and
   bug fixes that doesn't manage to catch up with the fast-paced Aptos ecosystem.

2. There's no way to understand a transaction in a user-friendly way.
   Signers always have to ask devs to understand the meaning of parameters and how they work together.
   Even devs themselves have to refer to source code to make sure a transaction is put together correctly.

3. There's no way to simulate a transaction before collecting enough signatures.
   Imagine you spend 3 days to collect approveals from 5 signatures living in 3 different continents for your 5-out-of-9 multisig, and then you find out that the transaction is invalid. You have to start over.

With the above issues, we believe that we need a new solution that is:

1. Open source and welcome collaboration, which unblocks (2) and (3)

2. Each protocol team can chime in and annotate transactions from their own protocols that makes aptos transactions understandable
   and transparent. Imagine Panora swap is annotated/templated by Panora team properly so that you are more confident of signing
   `swap 1000 USDC to USDT, in which 500 USDC goes through ThalaSwap pool abc and another 500 USDC goes through Liquidswap pool xyz`
   vs `panora::swap_entry payload=(0x10bce0456ce...)`

3. Make use of collective intelligence from the great Aptos dev community to making this public good keep getting better.
   Someone may push a feature that simulates a transaction right after users send a multisig proposal. Someone else may
   push ledger support since they use ledger extensively. Very meaningful contributions is welcomed and will be quickly
   reviewed and merged in.

4. We as the initial group of safely devs, will cover the initial development of the product until it is feature complete
   and we see it is ready for production use.

## Key Features

- Transaction simulation before signature collection
- Human-readable transaction descriptions
- Open-source and community-driven development
- Ledger support
- Movement support

## Usage

```
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
  docgen [options]    Generate documentation for the CLI
  help [command]      display help for command
```

See [docs.md](./docs.md) for more details.

## Development

1. Clone the repository
2. Install dependencies: `pnpm install`
3. Build: `pnpm build`
4. Link locally: `pnpm link -g`
5. Format code: `pnpm format`
6. Run in dev mode: `pnpm start`

## Community & Contributing

We welcome contributions from the whole Move ecosystem! Whether you're a protocol developer adding transaction templates, a developer improving core functionality, or a user reporting issues, your input helps make multisig management better for everyone.
