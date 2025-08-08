# @thalalabs/safely

## 0.2.1

### Patch Changes

- b295bc8: update readme
- Republish with correct version

## 0.2.0

### Minor Changes

- Add batch payload support and improve RPC configuration

  - Add batch payload support for propose raw command
  - Add YAML file support for payloads
  - Use Sentio RPC to bypass mainnet rate limits
  - Support flexible payload input via file, JSON string, or stdin

## 0.1.9

### Patch Changes

- 8dadf39: support contract upgrade txns
- cf4e7f6: fix tx serialization

## 0.1.8

### Patch Changes

- 22547a7: skip simulation when submitting to movement

## 0.1.7

### Patch Changes

- 7f8f9a4: error handling for tx deserialization failures

## 0.1.6

### Patch Changes

- 1f6b611: support custom network in encode/decode

## 0.1.5

### Patch Changes

- 430ade5: explicit messaging on empty simulation output

## 0.1.4

### Patch Changes

- 6e63528: bump aptos sdk
- 121b013: support execute_rejected_transaction in `execute` command

## 0.1.3

### Patch Changes

- 4930525: patch: support -p extracting network/fullnode url on proposal cmd

## 0.1.2

### Patch Changes

- 4d9e15f: fix `safely -v`

## 0.1.1

### Patch Changes

- c2542e3: update docs for public release

## 0.1.0

### Minor Changes

- b10479e: 1. Add interactive UI 2. Fix a lot of encoding/decoding bugs 3. Support default parameters 4. Get ready for beta users

### Patch Changes

- 3ae95ca: fix transfer_assets command and add e2e test for it

## 0.0.3

### Patch Changes

- 6d4613e: fix profile loading and support transfer fa
