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

  // Extract function arguments (just the values)
  const functionArguments = content.args.map((arg) => {
    if (!arg.type || arg.value === undefined) {
      throw new Error(`Invalid argument format: ${JSON.stringify(arg)}`);
    }
    return arg.value;
  });

  return {
    function: content.function_id as MoveFunctionId,
    typeArguments: content.type_args,
    functionArguments,
  };
}
