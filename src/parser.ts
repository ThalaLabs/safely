import {
  AccountAddress,
  Aptos,
  EntryFunction,
  fetchEntryFunctionAbi,
  Identifier,
  InputEntryFunctionData,
  ModuleId,
  MoveFunctionId,
  MoveString,
  MoveVector,
  MultiSigTransactionPayload,
  parseTypeTag,
  U256,
} from '@aptos-labs/ts-sdk';

import {
  Bool,
  Deserializer,
  EntryFunctionArgument,
  SimpleEntryFunctionArgumentTypes,
  TypeTag,
  U128,
  U16,
  U32,
  U64,
  U8,
} from '@aptos-labs/ts-sdk';

// TODO: this could throw an error if the payload is not even from a valid
// entry function, which could happen if we list rejected proposals
export async function decode(
  aptos: Aptos,
  hexStrWithPrefix: string
): Promise<InputEntryFunctionData> {
  const hexStrWithoutPrefix = hexStrWithPrefix.slice(2);
  const bytes = new Uint8Array(
    hexStrWithoutPrefix.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );
  const deserializer = new Deserializer(bytes);
  const payload = MultiSigTransactionPayload.deserialize(deserializer);
  const { module_name, function_name, type_args, args } = payload.transaction_payload;
  const packageAddress = module_name.address.toString();
  const packageName = module_name.name.identifier;
  const functionName = function_name.identifier;
  const functionId = `${packageAddress}::${packageName}::${functionName}`;

  const abi = await fetchEntryFunctionAbi(packageAddress, packageName, functionName, aptos.config);
  const functionArguments = abi.parameters.map((typeTag, i) => {
    if (i >= args.length) {
      return undefined;
    }
    return decodeArg(typeTag, args[i]);
  });

  const typeArguments = type_args.map((arg) => arg.toString());

  return {
    function: functionId as MoveFunctionId,
    typeArguments,
    functionArguments,
  };
}

// TODO: do we still need this?
// TODO: refactor using generateTransactionPayload
export async function encode(
  aptos: Aptos,
  functionId: string,
  typeArgs: string[],
  args: SimpleEntryFunctionArgumentTypes[]
): Promise<MultiSigTransactionPayload> {
  const [packageAddress, packageName, functionName] = functionId.split('::');
  const typeArgsTT = typeArgs.map((typeArg) => parseTypeTag(typeArg, { allowGenerics: false }));
  const abi = await fetchEntryFunctionAbi(packageAddress, packageName, functionName, aptos.config);
  const functionArgs = abi.parameters.map((typeTag, i) => {
    return encodeArg(typeTag, args[i]);
  });
  const entryFunction = new EntryFunction(
    ModuleId.fromStr(`${packageAddress}::${packageName}`),
    new Identifier(functionName),
    typeArgsTT,
    functionArgs
  );
  return new MultiSigTransactionPayload(entryFunction);
}

function decodeArg(typeTag: TypeTag, arg: EntryFunctionArgument): SimpleEntryFunctionArgumentTypes {
  const tt = typeTag.toString();
  const deserializer = new Deserializer(arg.bcsToBytes());
  if (tt === 'u8') {
    return U8.deserialize(deserializer).value;
  }
  if (tt === 'u16') {
    return U16.deserialize(deserializer).value;
  }
  if (tt === 'u32') {
    return U32.deserialize(deserializer).value;
  }
  if (tt === 'u64') {
    return U64.deserialize(deserializer).value;
  }
  if (tt === 'u128') {
    return U128.deserialize(deserializer).value;
  }
  if (tt === 'u256') {
    return U256.deserialize(deserializer).value;
  }
  if (tt === 'bool') {
    return Bool.deserialize(deserializer).value;
  }
  if (tt === 'address') {
    return AccountAddress.deserialize(deserializer).toString();
  }
  if (tt === '0x1::string::String') {
    return MoveString.deserialize(deserializer).value;
  }
  if (tt.startsWith('0x1::object::Object')) {
    return AccountAddress.deserialize(deserializer).toString();
  }
  if (tt === 'vector<u8>') {
    // TODO: very likely input params is a string
    return arg.bcsToBytes();
  }
  if (tt.startsWith('vector')) {
    if (tt === 'vector<u16>') {
      return MoveVector.deserialize(deserializer, U16).values;
    }
    if (tt === 'vector<u32>') {
      return MoveVector.deserialize(deserializer, U32).values;
    }
    if (tt === 'vector<u64>') {
      return MoveVector.deserialize(deserializer, U64).values;
    }
    if (tt === 'vector<u128>') {
      return MoveVector.deserialize(deserializer, U128).values;
    }
    if (tt === 'vector<u256>') {
      return MoveVector.deserialize(deserializer, U256).values;
    }
    if (tt === 'vector<bool>') {
      return MoveVector.deserialize(deserializer, Bool).values;
    }
    if (tt === 'vector<address>') {
      return MoveVector.deserialize(deserializer, AccountAddress).values;
    }
    if (tt === 'vector<0x1::string::String>') {
      return MoveVector.deserialize(deserializer, MoveString).values;
    }
    if (tt === 'vector<0x1::object::Object>') {
      return MoveVector.deserialize(deserializer, AccountAddress).values;
    }
    if (tt === 'vector<vector<u8>>') {
      // TODO: handle publish_package payload
      return arg.bcsToBytes();
    }
    if (tt.startsWith('vector<vector')) {
      // TODO: not sure how to handle this
      return arg.bcsToBytes();
    }
  }
  throw new Error(`[decodeArg] Unsupported type tag: ${tt}`);
}

function encodeArg(typeTag: TypeTag, arg: SimpleEntryFunctionArgumentTypes): EntryFunctionArgument {
  const tt = typeTag.toString();
  if (tt === 'u8') {
    return new U8(arg as number);
  }
  if (tt === 'u16') {
    return new U16(arg as number);
  }
  if (tt === 'u32') {
    return new U32(arg as number);
  }
  if (tt === 'u64') {
    return new U64(arg as bigint);
  }
  if (tt === 'u128') {
    return new U128(arg as bigint);
  }
  if (tt === 'u256') {
    return new U256(arg as bigint);
  }
  if (tt === 'bool') {
    return new Bool(arg as boolean);
  }
  if (tt === 'address') {
    return AccountAddress.from(arg as string);
  }
  // TODO: 0x1::string::String, 0x1::object::Object, vector<u8> and all vector<T> types
  throw new Error(`[encodeArg] Unsupported type tag: ${tt}`);
}
