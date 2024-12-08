## safely pending [options]

Get pending transaction(s) for a multisig

```
Options:
  -m, --multisig <address>        multisig contract address
  -s, --sequence_number <number>  fetch transaction with specific sequence number
  -h, --help                      display help for command
```

## safely executed [options]

Get successfully executed transactions for a multisig

```
Options:
  -m, --multisig <address>  multisig contract address
  -l, --limit <number>      number of executed transactions to fetch (default: 10)
  -h, --help                display help for command
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

Get summary information for a multisig

```
Options:
  -m, --multisig <address>  multisig contract address
  -h, --help                display help for command
```

## safely simulate [options]

Simulate transaction for a multisig (ignoring signer thresholds)

```
Options:
  -m, --multisig <address>        multisig contract address
  -s, --sequence_number <number>  fetch transaction with specific sequence number
  -h, --help                      display help for command
```

## safely vote [options] [command]

Vote on pending transaction

```
Options:
  -h, --help         display help for command
Commands:
  approve [options]  Approve pending transaction for a multisig
  reject [options]   Reject pending transaction for a multisig
  help [command]     display help for command
```

## safely vote approve [options]

Approve pending transaction for a multisig

```
Options:
  -m, --multisig <address>        multisig contract address
  -s, --sequence_number <number>  fetch transaction with specific sequence number
  -p, --profile <address>         profile name of voter
  -h, --help                      display help for command
```

## safely vote reject [options]

Reject pending transaction for a multisig

```
Options:
  -m, --multisig <address>        multisig contract address
  -s, --sequence_number <number>  fetch transaction with specific sequence number
  -p, --profile <address>         profile name of voter
  -h, --help                      display help for command
```

## safely propose [options]

Propose a multisig transaction

```
Options:
  -m, --multisig-address <multisig-address>  Multisig address
  -p, --profile <profile>                    Profile to use for the transaction
  -f, --txn-payload-file <file>              Path to the transaction payload file
  -h, --help                                 display help for command
```

## safely execute [options]

Execute a multisig transaction

```
Options:
  -m, --multisig-address <multisig-address>  Multisig address
  -p, --profile <profile>                    Profile to use for the transaction
  -h, --help                                 display help for command
```
