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
  MoveOption,
} from '@aptos-labs/ts-sdk';

type AptosArgType = U8 | U16 | U32 | U64 | U128 | U256 | Bool | MoveString | AccountAddress;

class NestedVector3 {
  inner: AptosArgType[][][];

  constructor(inner: AptosArgType[][][]) {
    this.inner = inner;
  }

  static deserialize(deserializer: Deserializer, argType: string): NestedVector3 {
    const typeMap: Record<string, { new (value: any): AptosArgType }> = {
      U8: U8,
      U16: U16,
      U32: U32,
      U64: U64,
      U128: U128,
      U256: U256,
      Bool: Bool,
      AccountAddress: AccountAddress,
      MoveString: MoveString,
    };

    const TypeConstructor = typeMap[argType];
    if (!TypeConstructor) throw new Error(`Unsupported type: ${argType}`);

    // Deserialize the vector length
    const outsideLength = deserializer.deserializeUleb128AsU32();
    const outside: AptosArgType[][][] = [];
    for (let i = 0; i < outsideLength; i++) {
      // Deserialize the inner vector length
      const innerLength = deserializer.deserializeUleb128AsU32();
      const inner: AptosArgType[][] = [];
      for (let j = 0; j < innerLength; j++) {
        // @ts-ignore
        inner.push(MoveVector.deserialize(deserializer, TypeConstructor).values);
      }
      outside.push(inner);
    }

    return new NestedVector3(outside);
  }
}

class NestedVector2 {
  inner: AptosArgType[][];

  constructor(inner: AptosArgType[][]) {
    this.inner = inner;
  }

  static deserialize(deserializer: Deserializer, argType: string): NestedVector2 {
    const typeMap: Record<string, { new (value: any): AptosArgType }> = {
      U8: U8,
      U16: U16,
      U32: U32,
      U64: U64,
      U128: U128,
      U256: U256,
      Bool: Bool,
      AccountAddress: AccountAddress,
      MoveString: MoveString,
    };

    const TypeConstructor = typeMap[argType];
    if (!TypeConstructor) throw new Error(`Unsupported type: ${argType}`);

    // Deserialize the vector length
    const length = deserializer.deserializeUleb128AsU32();
    const inner: AptosArgType[][] = [];
    for (let j = 0; j < length; j++) {
      // Deserialize the inner-inner vector length
      // @ts-ignore
      inner.push(MoveVector.deserialize(deserializer, TypeConstructor).values);
    }

    return new NestedVector2(inner);
  }
}

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
  const typeMap: Record<string, any> = {
    u8: U8,
    u16: U16,
    u32: U32,
    u64: U64,
    u128: U128,
    u256: U256,
    bool: Bool,
    '0x1::string::String': MoveString,
  };

  const nestedVector1Map: Record<string, any> = {
    'vector<u8>': U8,
    'vector<u16>': U16,
    'vector<u32>': U32,
    'vector<u64>': U64,
    'vector<u128>': U128,
    'vector<u256>': U256,
    'vector<bool>': Bool,
    'vector<address>': AccountAddress,
    'vector<0x1::string::String>': MoveString,
    'vector<0x1::object::Object>': AccountAddress,
    'vector<0x1::object::Object<0x1::fungible_asset::Metadata>>': AccountAddress,
    'vector<0x1::object::Object<0x6a01d5761d43a5b5a0ccbfc42edf2d02c0611464aae99a2ea0e0d4819f0550b5::lending::Market>>':
      AccountAddress,
  };

  const nestedVector2Map: Record<string, string> = {
    'vector<vector<u8>>': 'U8',
    'vector<vector<u16>>': 'U16',
    'vector<vector<u32>>': 'U32',
    'vector<vector<u64>>': 'U64',
    'vector<vector<u128>>': 'U128',
    'vector<vector<u256>>': 'U256',
    'vector<vector<bool>>': 'Bool',
    'vector<vector<address>>': 'AccountAddress',
  };

  const nestedVector3Map: Record<string, string> = {
    'vector<vector<vector<u8>>>': 'U8',
    'vector<vector<vector<u16>>>': 'U16',
    'vector<vector<vector<u32>>>': 'U32',
    'vector<vector<vector<u64>>>': 'U64',
    'vector<vector<vector<u128>>>': 'U128',
    'vector<vector<vector<u256>>>': 'U256',
    'vector<vector<vector<bool>>>': 'Bool',
    'vector<vector<vector<address>>>': 'AccountAddress',
  };

  const tt = typeTag.toString();
  const deserializer = new Deserializer(arg.bcsToBytes());

  if (tt in typeMap) {
    return typeMap[tt].deserialize(deserializer).value;
  }

  if (tt == 'address' || tt.startsWith('0x1::object::Object')) {
    return AccountAddress.deserialize(deserializer).toString();
  }

  // Note for reader:
  // > MoveOption.deserialize(deserializer, AccountAddress)
  // Errors with:
  // > Error: Hex string is too long, must be 1 to 64 chars long, excluding the leading 0x.
  //
  // This is because MoveOption adds an extra "0/1" byte to the argument representing isSome() - so the deserializer data was too long as a result
  // To accommodate this, we first manually extract the first byte
  // - if byte == 1 (isSome()), then deserialize bytes [1, 65]
  // - if byte == 0 (!isSome()), then return empty
  if (tt == '0x1::option::Option<address>') {
    const isSome = arg.bcsToBytes()[0] == 1;
    if (isSome) {
      // Construct account address
      const addressInternal = new AccountAddress(arg.bcsToBytes().slice(1));
      const addressOption = new MoveOption<AccountAddress>(addressInternal);
      const optionDeserializer = new Deserializer(addressOption.bcsToBytes());

      return AccountAddress.deserialize(optionDeserializer).toString();
    }

    // return empty string if option is empty
    return '';
  }

  // Support generic type parsing for Option type
  if (tt.startsWith('0x1::option::Option')) {
    const option = MoveOption.deserialize(deserializer, typeMap[tt]);

    if (option.isSome()) {
      // option.value returns class object
      // option.value.value unpacks class object, returning deserialized struct
      // @ts-ignore
      return option.value.value;
    }

    // return empty string if option is empty
    return '';
  }

  if (tt in nestedVector1Map) {
    // @ts-ignore
    return MoveVector.deserialize(deserializer, nestedVector1Map[tt]).values;
  }

  if (tt in nestedVector2Map) {
    return NestedVector2.deserialize(deserializer, nestedVector2Map[tt]).inner;
  }

  if (tt in nestedVector3Map) {
    return NestedVector3.deserialize(deserializer, nestedVector3Map[tt]).inner;
  }

  throw new Error(`[decodeArg] Unsupported type tag: ${typeTag}`);
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
