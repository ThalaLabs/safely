# dontrust

Don't trust, verify.

A **highly visible** CLI tool for managing multisig on Aptos.

## Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Link locally: `npm link`
5. Format code: `npm run format`
6. Run in dev mode: `npm run start`

## Usage

List executed transactions for a multisig:
`dontrust executed -m <multisig-address>`

List last N executed transactions for a multisig:
`dontrust executed -m <multisig-address> -l <number>`

List pending transactions for a multisig:
`dontrust pending -m <multisig-address>`

List a specific pending transaction for a multisig:
`dontrust pending -m <multisig-address> -s <sequence-number>`

Decode transaction bytes:
`dontrust decode -b <transaction-bytes>`

List addresses in address book:
`dontrust addresses list`

Add address to address book:
`dontrust addresses add --alias bob-treasury --address 0x123`

Remove address from address book:
`dontrust addresses remove --alias bob-treasury`
