# dontrust

Don't trust, verify.

A **highly visible** CLI tool for managing multisig on Aptos.

## Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Link locally: `npm link`
5. Format code: `npm run format`
6. Run in dev mode: `dontrust`

## Usage

List pending transactions for a multisig:
`dontrust pending -m <multisig-address>`

Decode transaction bytes:
`dontrust decode -b <transaction-bytes>`
