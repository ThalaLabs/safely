import {
  InputEntryFunctionData,
  MoveFunctionId,
  SimpleEntryFunctionArgumentTypes,
} from '@aptos-labs/ts-sdk';
import * as fs from 'fs';

export async function serializeEntryFunction(functionId: string) {}

export function decodeEntryFunction(filePath: string): InputEntryFunctionData {
  const file = fs.readFileSync(filePath, 'utf8');
  const content = JSON.parse(file) as {
    function_id: string;
    type_args: string[];
    args: Array<{ type: string; value: SimpleEntryFunctionArgumentTypes }>;
  };

  // Explicitly handle hex args (which must be cast to vector<u8> or vector<vector<u8>> types)
  const hexDecodedArgs = content.args.map((arg) => {
    // Hex args need to be decoded into vector<u8> equivalents
    if (arg.type === 'hex') {
      return typeof arg.value === 'string'
        ? hexToBytes(arg.value)
        : // @ts-ignore
          arg.value.map((hexStr) => hexToBytes(hexStr));
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
