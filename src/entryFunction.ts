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
    functionArguments: content.args.map((arg) => arg.value),
    // TODO: abi
  };
}
