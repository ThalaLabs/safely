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
  return {
    function: content.function_id as MoveFunctionId,
    typeArguments: content.type_args,
    functionArguments: content.args.map((arg) => serializeEntryFunctionArgs(arg)),
    // TODO: abi
  };
}

// "Hex" Type is not natively supported in @aptos-labs/ts-sdk's SimpleEntryFunctionArgumentTypes
// For this reason, we explicitly provide instructions to serialize the hex arg type if present
export function serializeEntryFunctionArgs(arg: { type: string, value: SimpleEntryFunctionArgumentTypes }): SimpleEntryFunctionArgumentTypes {
  if (arg.type == "hex") {
    // @ts-ignore
    const hexStrWithoutPrefix = arg.value.slice(2);

    return new Uint8Array(
        // @ts-ignore
        hexStrWithoutPrefix.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );
  }

  return arg.value
}
