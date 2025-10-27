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
  Serializer,
} from '@aptos-labs/ts-sdk';

// ============================================================================
// TYPE SYSTEM - Single source of truth for all Move types
// ============================================================================

interface TypeConfig {
  // SDK class constructor for deserialization
  sdkClass: any;

  // How to normalize the deserialized value to JS primitive
  normalize: (value: any) => any;

  // How to encode a JS primitive back to SDK class
  encode: (value: any) => any;
}

const TYPE_REGISTRY: Record<string, TypeConfig> = {
  u8: {
    sdkClass: U8,
    normalize: (v: U8) => v.value,
    encode: (v: number) => new U8(v),
  },
  u16: {
    sdkClass: U16,
    normalize: (v: U16) => v.value,
    encode: (v: number) => new U16(v),
  },
  u32: {
    sdkClass: U32,
    normalize: (v: U32) => v.value,
    encode: (v: number) => new U32(v),
  },
  u64: {
    sdkClass: U64,
    normalize: (v: U64) => v.value, // bigint
    encode: (v: bigint) => new U64(v),
  },
  u128: {
    sdkClass: U128,
    normalize: (v: U128) => v.value,
    encode: (v: bigint) => new U128(v),
  },
  u256: {
    sdkClass: U256,
    normalize: (v: U256) => v.value,
    encode: (v: bigint) => new U256(v),
  },
  bool: {
    sdkClass: Bool,
    normalize: (v: Bool) => v.value,
    encode: (v: boolean) => new Bool(v),
  },
  address: {
    sdkClass: AccountAddress,
    normalize: (v: AccountAddress) => v.toString(),
    encode: (v: string) => AccountAddress.from(v),
  },
  '0x1::string::String': {
    sdkClass: MoveString,
    normalize: (v: MoveString) => v.value,
    encode: (v: string) => new MoveString(v),
  },
};

// ============================================================================
// TYPE INTROSPECTION - Understanding TypeTag structure
// ============================================================================

function isVectorType(typeTag: TypeTag): boolean {
  return (
    'value' in typeTag &&
    typeTag.toString().startsWith('vector<') &&
    !('moduleName' in (typeTag.value as any))
  );
}

function isStructType(typeTag: TypeTag): boolean {
  return 'value' in typeTag && 'moduleName' in (typeTag.value as any);
}

function getInnerType(vectorTag: TypeTag): TypeTag {
  if (!isVectorType(vectorTag)) {
    throw new Error(`Not a vector type: ${vectorTag.toString()}`);
  }
  return (vectorTag as any).value;
}

interface StructInfo {
  address: string;
  module: string;
  name: string;
  typeArgs: TypeTag[];
  fullName: string;
}

function getStructInfo(structTag: TypeTag): StructInfo {
  if (!isStructType(structTag)) {
    throw new Error(`Not a struct type: ${structTag.toString()}`);
  }

  const value = (structTag as any).value;
  const address = value.address.toString();
  const module = value.moduleName.identifier;
  const name = value.name.identifier;
  const fullName = `${address}::${module}::${name}`;

  return {
    address,
    module,
    name,
    typeArgs: value.typeArgs || [],
    fullName,
  };
}

// ============================================================================
// RECURSIVE DECODER - Main decoding logic
// ============================================================================

export function decodeArg(
  typeTag: TypeTag,
  arg: EntryFunctionArgument
): SimpleEntryFunctionArgumentTypes {
  const deserializer = new Deserializer(arg.bcsToBytes());
  return decodeWithDeserializer(typeTag, deserializer);
}

function decodeWithDeserializer(typeTag: TypeTag, deserializer: Deserializer): any {
  const typeStr = typeTag.toString();

  // 1. Handle vectors recursively
  if (isVectorType(typeTag)) {
    return decodeVector(typeTag, deserializer);
  }

  // 2. Handle structs (string, option, object)
  if (isStructType(typeTag)) {
    return decodeStruct(typeTag, deserializer);
  }

  // 3. Handle primitives
  const config = TYPE_REGISTRY[typeStr];
  if (!config) {
    throw new Error(`[decodeArg] Unsupported type: ${typeStr}`);
  }

  const sdkValue = config.sdkClass.deserialize(deserializer);
  return config.normalize(sdkValue);
}

function decodeVector(vectorTag: TypeTag, deserializer: Deserializer): any {
  const innerTag = getInnerType(vectorTag);
  const innerTypeStr = innerTag.toString();

  // Special case: vector<u8> should be Uint8Array, not array of numbers
  if (innerTypeStr === 'u8') {
    const vector = MoveVector.deserialize(deserializer, U8);
    const bytes = vector.values.map((u: U8) => u.value);
    return Uint8Array.from(bytes);
  }

  // Get config for simple types
  const config = TYPE_REGISTRY[innerTypeStr];

  if (config) {
    // Simple type vector - deserialize and normalize each element
    const vector = MoveVector.deserialize(deserializer, config.sdkClass);
    return vector.values.map(config.normalize);
  }

  // Recursive case: vector of vectors
  if (isVectorType(innerTag)) {
    const length = deserializer.deserializeUleb128AsU32();
    const result = [];
    for (let i = 0; i < length; i++) {
      result.push(decodeVector(innerTag, deserializer));
    }
    return result;
  }

  // Recursive case: vector of structs
  if (isStructType(innerTag)) {
    const structInfo = getStructInfo(innerTag);

    // Handle vector<0x1::string::String>
    if (structInfo.fullName === '0x1::string::String') {
      const vector = MoveVector.deserialize(deserializer, MoveString);
      return vector.values.map((s: MoveString) => s.value);
    }

    // Handle vector<0x1::object::Object<T>>
    if (structInfo.module === 'object' && structInfo.name === 'Object') {
      const vector = MoveVector.deserialize(deserializer, AccountAddress);
      return vector.values.map((addr: AccountAddress) => addr.toString());
    }

    // Handle vector<0x1::option::Option<T>>
    if (structInfo.module === 'option' && structInfo.name === 'Option') {
      const length = deserializer.deserializeUleb128AsU32();
      const result = [];
      for (let i = 0; i < length; i++) {
        result.push(decodeOption(innerTag, deserializer));
      }
      return result;
    }

    throw new Error(`[decodeVector] Unsupported struct type in vector: ${structInfo.fullName}`);
  }

  throw new Error(`[decodeVector] Unsupported vector inner type: ${innerTypeStr}`);
}

function decodeStruct(structTag: TypeTag, deserializer: Deserializer): any {
  const structInfo = getStructInfo(structTag);

  // Handle 0x1::string::String
  if (structInfo.fullName === '0x1::string::String') {
    const str = MoveString.deserialize(deserializer);
    return str.value;
  }

  // Handle 0x1::option::Option<T>
  if (structInfo.module === 'option' && structInfo.name === 'Option') {
    return decodeOption(structTag, deserializer);
  }

  // Handle 0x1::object::Object<T> (treated as address)
  if (structInfo.module === 'object' && structInfo.name === 'Object') {
    const addr = AccountAddress.deserialize(deserializer);
    return addr.toString();
  }

  throw new Error(`[decodeStruct] Unsupported struct: ${structInfo.fullName}`);
}

function decodeOption(optionTag: TypeTag, deserializer: Deserializer): any | undefined {
  const structInfo = getStructInfo(optionTag);

  if (structInfo.typeArgs.length !== 1) {
    throw new Error(
      `[decodeOption] Option must have exactly 1 type arg, got ${structInfo.typeArgs.length}`
    );
  }

  const innerTag = structInfo.typeArgs[0];
  const innerTypeStr = innerTag.toString();

  // Handle Option<address> - special case since AccountAddress doesn't have .value
  if (innerTypeStr === 'address' || innerTypeStr.startsWith('0x1::object::Object')) {
    const option = MoveOption.deserialize(deserializer, AccountAddress);
    if (!option.isSome()) {
      return undefined;
    }
    const unwrapped = option.unwrap() as AccountAddress;
    return unwrapped.toString();
  }

  const config = TYPE_REGISTRY[innerTypeStr];
  if (!config) {
    throw new Error(`[decodeOption] Unsupported Option inner type: ${innerTypeStr}`);
  }

  const option = MoveOption.deserialize(deserializer, config.sdkClass);

  if (!option.isSome()) {
    return undefined;
  }

  const unwrapped = option.unwrap();
  return config.normalize(unwrapped);
}

// ============================================================================
// RECURSIVE ENCODER - Mirror of decoder for symmetry
// ============================================================================

export function encodeArg(typeStr: string, value: any): EntryFunctionArgument {
  const typeTag = parseTypeTag(typeStr, { allowGenerics: false });
  return encodeWithTypeTag(typeTag, value);
}

function encodeWithTypeTag(typeTag: TypeTag, value: any): EntryFunctionArgument {
  const typeStr = typeTag.toString();

  // 1. Handle vectors
  if (isVectorType(typeTag)) {
    return encodeVector(typeTag, value);
  }

  // 2. Handle structs
  if (isStructType(typeTag)) {
    return encodeStruct(typeTag, value);
  }

  // 3. Handle primitives
  const config = TYPE_REGISTRY[typeStr];
  if (!config) {
    throw new Error(`[encodeArg] Unsupported type: ${typeStr}`);
  }

  return config.encode(value);
}

function encodeVector(vectorTag: TypeTag, values: any): EntryFunctionArgument {
  const innerTag = getInnerType(vectorTag);
  const innerTypeStr = innerTag.toString();

  // Special case: Uint8Array or hex string → vector<u8>
  if (innerTypeStr === 'u8') {
    let bytes: number[];

    if (values instanceof Uint8Array) {
      bytes = Array.from(values);
    } else if (typeof values === 'string' && values.startsWith('0x')) {
      // Convert hex to bytes
      const hex = values.slice(2);
      bytes = hex.match(/.{2}/g)?.map((b) => parseInt(b, 16)) || [];
    } else {
      throw new Error(
        `[encodeVector] vector<u8> must be Uint8Array or hex string, got ${typeof values}`
      );
    }

    return new MoveVector(bytes.map((b) => new U8(b)));
  }

  if (!Array.isArray(values)) {
    throw new Error(`[encodeVector] Expected array for vector type, got ${typeof values}`);
  }

  // Get config for simple types
  const config = TYPE_REGISTRY[innerTypeStr];

  if (config) {
    // Simple type vector
    const encoded = values.map(config.encode);
    return new MoveVector(encoded);
  }

  // Recursive: vector of vectors or vector of structs
  if (isVectorType(innerTag)) {
    // Manually serialize nested vectors
    const serializer = new Serializer();
    serializer.serializeU32AsUleb128(values.length);
    for (const innerValue of values) {
      const encoded = encodeVector(innerTag, innerValue);
      // Append the inner vector's bytes directly without an extra length prefix
      // Each inner vector already contains its own length field
      const innerBytes = encoded.bcsToBytes();
      serializer.serializeFixedBytes(innerBytes);
    }

    return {
      bcsToBytes: () => serializer.toUint8Array(),
    } as EntryFunctionArgument;
  }

  if (isStructType(innerTag)) {
    const encoded = values.map((v) => encodeStruct(innerTag, v)) as any[];
    return new MoveVector(encoded);
  }

  throw new Error(`[encodeVector] Unsupported vector inner type: ${innerTypeStr}`);
}

function encodeStruct(structTag: TypeTag, value: any): EntryFunctionArgument {
  const structInfo = getStructInfo(structTag);

  // Handle 0x1::string::String
  if (structInfo.fullName === '0x1::string::String') {
    return new MoveString(value);
  }

  // Handle 0x1::object::Object<T>
  if (structInfo.module === 'object' && structInfo.name === 'Object') {
    return AccountAddress.from(value);
  }

  // Handle 0x1::option::Option<T>
  if (structInfo.module === 'option' && structInfo.name === 'Option') {
    if (structInfo.typeArgs.length !== 1) {
      throw new Error(`[encodeStruct] Option must have exactly 1 type arg`);
    }

    const innerTag = structInfo.typeArgs[0];
    const innerTypeStr = innerTag.toString();

    // Handle Option<address>
    if (innerTypeStr === 'address' || innerTypeStr.startsWith('0x1::object::Object')) {
      if (value === undefined || value === null) {
        return new MoveOption();
      }
      return new MoveOption(AccountAddress.from(value));
    }

    const config = TYPE_REGISTRY[innerTypeStr];
    if (!config) {
      throw new Error(`[encodeStruct] Unsupported Option inner type: ${innerTypeStr}`);
    }

    if (value === undefined || value === null) {
      return new MoveOption();
    }

    return new MoveOption(config.encode(value));
  }

  throw new Error(`[encodeStruct] Unsupported struct: ${structInfo.fullName}`);
}

// ============================================================================
// PUBLIC API - Used by the rest of the application
// ============================================================================

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
    return encodeWithTypeTag(typeTag, args[i]);
  });
  const entryFunction = new EntryFunction(
    ModuleId.fromStr(`${packageAddress}::${packageName}`),
    new Identifier(functionName),
    typeArgsTT,
    functionArgs
  );
  return new MultiSigTransactionPayload(entryFunction);
}
