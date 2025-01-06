## safely account [options] [command]

Multisig account operations

```
Options:
  -h, --help        display help for command
Commands:
  create [options]  Create a new multisig account
  update [options]  Update multisig owners and optionally the number of required signatures
  show [options]    Show multisig summary
  help [command]    display help for command
```

## safely account create [options]

Create a new multisig account

```
Options:
  -o, --additional-owners <addresses>     Comma-separated list of additional owner addresses
  -n, --num-signatures-required <number>  Number of signatures required for execution
  -p, --profile <string>                  Profile to use for the transaction
  -h, --help                              display help for command
```

## safely account update [options]

Update multisig owners and optionally the number of required signatures

```
Options:
  -m, --multisig-address <address>        multisig account address
  -a, --owners-add <addresses>            Comma-separated list of owner addresses to add
  -r, --owners-remove <addresses>         Comma-separated list of owner addresses to remove
  -n, --num-signatures-required <number>  New number of signatures required for execution
  -p, --profile <string>                  Profile to use for the transaction
  -h, --help                              display help for command
```

## safely account show [options]

Show multisig summary

```
Options:
  -m, --multisig-address <address>  multisig account address
  --network <network>               network to use (choices: "devnet", "testnet", "mainnet", "custom", default: "mainnet")
  --fullnode <url>                  Fullnode URL for custom network
  -h, --help                        display help for command
```

## safely propose [options] [command]

Propose a new transaction for a multisig

```
Options:
  -m, --multisig-address <address>  multisig account address
  -p, --profile <string>            Profile to use for the transaction
  -h, --help                        display help for command
Commands:
  raw [options]                     Propose a raw transaction from a payload file
  predefined                        Propose a predefined transaction type
  help [command]                    display help for command
```

## safely propose raw [options]

Propose a raw transaction from a payload file

```
Options:
  -f, --txn-payload-file <file>  Path to the transaction payload file
  -h, --help                     display help for command
```

## safely propose predefined [options] [command]

Propose a predefined transaction type

```
Options:
  -h, --help                 display help for command
Commands:
  transfer-assets [options]  Transfer assets to an address
  help [command]             display help for command
```

## safely propose predefined transfer-assets [options]

Transfer assets to an address

```
Options:
  --asset <type>         Either coin type of fungible asset address
  --recipient <address>  Recipient address
  --amount <number>      Amount to transfer
  -h, --help             display help for command
```

## safely vote [options]

Vote on a pending transaction

```
Options:
  -m, --multisig-address <address>  multisig account address
  -s, --sequence-number <number>    sequence number of transaction to vote on
  -a, --approve <boolean>           true to approve, false to reject
  -p, --profile <string>            profile name of voter
  -h, --help                        display help for command
```

## safely execute [options]

Execute a multisig transaction

```
Options:
  -m, --multisig-address <address>  multisig account address
  -a, --approve <boolean>           true to approve, false to reject
  -p, --profile <string>            Profile to use for the transaction
  -h, --help                        display help for command
```

## safely proposal [options]

List proposals for a multisig

```
Options:
  -m, --multisig-address <address>  multisig account address
  --network <network>               network to use (choices: "devnet", "testnet", "mainnet", "custom", default: "mainnet")
  --fullnode <url>                  Fullnode URL for custom network
  -f, --filter <status>             filter proposals by status (default: "pending")
  -s, --sequence-number <number>    fetch transaction with specific sequence number
  -l, --limit <number>              number of transactions to fetch (default: 20)
  -h, --help                        display help for command
```

## safely simulate [options]

Simulate multisig transaction

```
Options:
  -m, --multisig-address <address>  multisig account address
  --network <network>               network to use (choices: "devnet", "testnet", "mainnet", "custom", default: "mainnet")
  --fullnode <url>                  Fullnode URL for custom network
  -s, --sequence-number <number>    fetch transaction with specific sequence number
  -h, --help                        display help for command
```

## safely decode [options]

Decode multisig transaction bytes (experimental)

```
Options:
  -b, --bytes <bytes>  transaction bytes to decode (hex string starting with 0x)
  --network <network>  network to use (choices: "devnet", "testnet", "mainnet", "custom", default: "mainnet")
  --fullnode <url>     Fullnode URL for custom network
  -h, --help           display help for command
```

## safely encode [options]

Encode entry function payload (experimental)

```
Options:
  -f, --txn-payload-file <txn-payload-file>  transaction payload file to encode
  --network <network>                        network to use (choices: "devnet", "testnet", "mainnet", "custom", default: "mainnet")
  --fullnode <url>                           Fullnode URL for custom network
  -h, --help                                 display help for command
```

## safely addresses [options] [command]

Manage the local address book (experimental)

```
Options:
  -h, --help        display help for command
Commands:
  add [options]     Add a new alias and address to the local address book
  list              List all saved aliases and addresses
  remove [options]  Remove an alias from the local address book
  help [command]    display help for command
```

## safely addresses add [options]

Add a new alias and address to the local address book

```
Options:
  --alias <alias>      Alias for the address
  --address <address>  Hexadecimal address (e.g., 0xabc)
  -h, --help           display help for command
```

## safely addresses list [options]

List all saved aliases and addresses

```
Options:
  -h, --help  display help for command
```

## safely addresses remove [options]

Remove an alias from the local address book

```
Options:
  --alias <alias>  Alias to remove
  -h, --help       display help for command
```
