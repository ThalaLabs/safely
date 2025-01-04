## safely proposal [options]

List proposals for a multisig

```
Options:
  -m, --multisig-address <address>  multisig account address
  -f, --filter <status>             filter proposals by status (default: "pending")
  -s, --sequence-number <number>    fetch transaction with specific sequence number
  -l, --limit <number>              number of transactions to fetch (default: 20)
  -h, --help                        display help for command
```
## safely decode [options]

Decode multisig transaction bytes

```
Options:
  -b, --bytes <bytes>  transaction bytes to decode (hex string starting with 0x)
  -h, --help           display help for command
```
## safely encode [options]

Encode entry function payload

```
Options:
  -f, --txn-payload-file <txn-payload-file>  transaction payload file to encode
  -h, --help                                 display help for command
```
## safely addresses [options] [command]

Manage the local address book

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
## safely summary [options]

Get summary of a multisig account

```
Options:
  -m, --multisig-address <address>  multisig account address
  -h, --help                        display help for command
```
## safely simulate [options]

Simulate transaction for a multisig (ignoring signer thresholds)

```
Options:
  -m, --multisig-address <address>  multisig account address
  -s, --sequence-number <number>    fetch transaction with specific sequence number
  -h, --help                        display help for command
```
## safely vote [options]

Vote on a pending transaction

```
Options:
  -m, --multisig-address <address>  multisig account address
  -s, --sequence-number <number>    sequence number of transaction to vote on
  -a, --approve <boolean>           true to approve, false to reject
  -p, --profile <address>           profile name of voter
  -l, --ledgerIndex <ledgerIndex>   Ledger index for the transaction
  -h, --help                        display help for command
```
## safely propose [options] [command]

Propose a new transaction for a multisig

```
Options:
  -m, --multisig-address <address>  multisig account address
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
  -f, --txn-payload-file <file>    Path to the transaction payload file
  -p, --profile <profile>          Profile to use for the transaction
  -l, --ledgerIndex <ledgerIndex>  Ledger index for the transaction
  -h, --help                       display help for command
```
## safely propose predefined [options] [command]

Propose a predefined transaction type

```
Options:
  -h, --help                display help for command
Commands:
  transfer-coins [options]  Transfer coins to an address
  help [command]            display help for command
```
## safely propose predefined transfer-coins [options]

Transfer coins to an address

```
Options:
  --coin-type <type>               Coin type
  --recipient <address>            Recipient address
  --amount <number>                Amount to transfer
  -p, --profile <profile>          Profile to use for the transaction
  -l, --ledgerIndex <ledgerIndex>  Ledger index for the transaction
  -h, --help                       display help for command
```
## safely execute [options]

Execute a multisig transaction

```
Options:
  -m, --multisig-address <address>  multisig account address
  -a, --approve <boolean>           true to approve, false to reject
  -p, --profile <profile>           Profile to use for the transaction
  -l, --ledgerIndex <ledgerIndex>   Ledger index for the transaction
  -h, --help                        display help for command
```
## safely owners [options] [command]

Multisig owner operations

```
Options:
  -m, --multisig-address <address>  multisig account address
  -h, --help                        display help for command
Commands:
  list                              List multisig owners
  add [options]                     Add owners to multisig
  remove [options]                  Remove owners from multisig
  swap [options]                    Swap owners of multisig
  help [command]                    display help for command
```
## safely owners list [options]

List multisig owners

```
Options:
  -h, --help  display help for command
```
## safely owners add [options]

Add owners to multisig

```
Options:
  --owners <addresses>             Comma-separated list of owner addresses
  -p, --profile <profile>          Profile to use for the transaction
  -l, --ledgerIndex <ledgerIndex>  Ledger index for the transaction
  -h, --help                       display help for command
```
## safely owners remove [options]

Remove owners from multisig

```
Options:
  --owners <addresses>             Comma-separated list of owner addresses
  -p, --profile <profile>          Profile to use for the transaction
  -l, --ledgerIndex <ledgerIndex>  Ledger index for the transaction
  -h, --help                       display help for command
```
## safely owners swap [options]

Swap owners of multisig

```
Options:
  --owners-in <addresses>          Comma-separated list of owner addresses to add
  --owners-out <addresses>         Comma-separated list of owner addresses to remove
  -p, --profile <profile>          Profile to use for the transaction
  -l, --ledgerIndex <ledgerIndex>  Ledger index for the transaction
  -h, --help                       display help for command
```