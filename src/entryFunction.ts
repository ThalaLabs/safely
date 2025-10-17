import {
  InputEntryFunctionData,
  MoveFunctionId,
  SimpleEntryFunctionArgumentTypes,
} from '@aptos-labs/ts-sdk';

export function isBatchPayload(jsonContent: string): boolean {
  try {
    const parsed = JSON.parse(jsonContent);
    return Array.isArray(parsed);
  } catch {
    return false;
  }
}

export function parseBatchPayload(jsonContent: string): InputEntryFunctionData[] {
  const payloads = JSON.parse(jsonContent);

  if (!Array.isArray(payloads)) {
    throw new Error('Batch payload must be an array');
  }

  return payloads.map((payload, index) => {
    try {
      return parseSinglePayload(payload);
    } catch (error) {
      throw new Error(`Invalid payload at index ${index}: ${(error as Error).message}`);
    }
  });
}

export function parseEntryFunctionPayload(jsonContent: string): InputEntryFunctionData {
  const content = JSON.parse(jsonContent);
  return parseSinglePayload(content);
}

function parseSinglePayload(content: {
  function_id: string;
  type_args: string[];
  args: Array<{ type: string; value: SimpleEntryFunctionArgumentTypes }>;
}): InputEntryFunctionData {
  // Validate required fields
  if (!content.function_id) {
    throw new Error('Missing required field: function_id');
  }
  if (!Array.isArray(content.type_args)) {
    throw new Error('type_args must be an array');
  }
  if (!Array.isArray(content.args)) {
    throw new Error('args must be an array');
  }

  // Explicitly handle hex args (which must be cast to vector<u8> or vector<vector<u8>> types)
  // This is to handle payload file such as 0x1::code::publish_package_txn
  const hexDecodedArgs = content.args.map((arg) => {
    // Hex args need to be decoded into vector<u8> equivalents
    if (arg.type === 'hex') {
      // vector<u8>
      if (typeof arg.value === 'string') {
        return hexToBytes(arg.value);
      }

      // vector<vector<u8>>
      if (Array.isArray(arg.value) && arg.value.every((v) => typeof v === 'string')) {
        return arg.value.map((hexStr) => hexToBytes(hexStr));
      }
    }

    return arg.value;
  });

  return {
    function: content.function_id as MoveFunctionId,
    typeArguments: content.type_args,
    functionArguments: hexDecodedArgs,
  };
}

function hexToBytes(hexString: string) {
  // Remove "0x" prefix if present
  if (hexString.startsWith('0x')) {
    hexString = hexString.slice(2);
  }

  const matched = hexString.match(/.{1,2}/g);
  if (!matched) return new Uint8Array(); // Return an empty Uint8Array if no match

  // Convert hex to byte array
  return new Uint8Array(matched.map((byte) => parseInt(byte, 16)));
}
