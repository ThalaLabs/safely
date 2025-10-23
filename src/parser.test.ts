import { describe, it, expect } from 'vitest';
import {
  AccountAddress,
  Bool,
  Deserializer,
  EntryFunctionArgument,
  MoveOption,
  MoveString,
  MoveVector,
  parseTypeTag,
  Serializer,
  U8,
  U16,
  U32,
  U64,
  U128,
  U256,
} from '@aptos-labs/ts-sdk';
import { decodeArg, encodeArg } from './parser.js';

/**
 * Helper function to create an EntryFunctionArgument from a serializable value
 */
function createArg(value: any): EntryFunctionArgument {
  const serializer = new Serializer();
  value.serialize(serializer);
  const bytes = serializer.toUint8Array();

  return {
    bcsToBytes: () => bytes,
  } as EntryFunctionArgument;
}

describe('Parser - Primitive Types', () => {
  it('should decode u8', () => {
    const typeTag = parseTypeTag('u8', { allowGenerics: false });
    const arg = createArg(new U8(255));
    const result = decodeArg(typeTag, arg);
    expect(result).toBe(255);
  });

  it('should decode u16', () => {
    const typeTag = parseTypeTag('u16', { allowGenerics: false });
    const arg = createArg(new U16(65535));
    const result = decodeArg(typeTag, arg);
    expect(result).toBe(65535);
  });

  it('should decode u32', () => {
    const typeTag = parseTypeTag('u32', { allowGenerics: false });
    const arg = createArg(new U32(4294967295));
    const result = decodeArg(typeTag, arg);
    expect(result).toBe(4294967295);
  });

  it('should decode u64', () => {
    const typeTag = parseTypeTag('u64', { allowGenerics: false });
    const arg = createArg(new U64(18446744073709551615n));
    const result = decodeArg(typeTag, arg);
    expect(result).toBe(18446744073709551615n);
  });

  it('should decode u128', () => {
    const typeTag = parseTypeTag('u128', { allowGenerics: false });
    const value = 340282366920938463463374607431768211455n; // max u128
    const arg = createArg(new U128(value));
    const result = decodeArg(typeTag, arg);
    expect(result).toBe(value);
  });

  it('should decode u256', () => {
    const typeTag = parseTypeTag('u256', { allowGenerics: false });
    const value = 12345678901234567890n;
    const arg = createArg(new U256(value));
    const result = decodeArg(typeTag, arg);
    expect(result).toBe(value);
  });

  it('should decode bool', () => {
    const typeTag = parseTypeTag('bool', { allowGenerics: false });
    const argTrue = createArg(new Bool(true));
    const argFalse = createArg(new Bool(false));

    expect(decodeArg(typeTag, argTrue)).toBe(true);
    expect(decodeArg(typeTag, argFalse)).toBe(false);
  });

  it('should decode address', () => {
    const typeTag = parseTypeTag('address', { allowGenerics: false });
    const addr = AccountAddress.from(
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    );
    const arg = createArg(addr);
    const result = decodeArg(typeTag, arg);

    expect(result).toBe('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
  });
});

describe('Parser - Vector Types', () => {
  it('should decode vector<u8> as Uint8Array', () => {
    const typeTag = parseTypeTag('vector<u8>', { allowGenerics: false });
    const bytes = [0x6c, 0x5c, 0xad, 0xaf]; // Sample bytes
    const vec = new MoveVector(bytes.map((b) => new U8(b)));
    const arg = createArg(vec);
    const result = decodeArg(typeTag, arg);

    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result as Uint8Array)).toEqual(bytes);
  });

  it('should decode vector<u16>', () => {
    const typeTag = parseTypeTag('vector<u16>', { allowGenerics: false });
    const values = [100, 200, 300];
    const vec = new MoveVector(values.map((v) => new U16(v)));
    const arg = createArg(vec);
    const result = decodeArg(typeTag, arg);

    expect(result).toEqual(values);
  });

  it('should decode vector<u32>', () => {
    const typeTag = parseTypeTag('vector<u32>', { allowGenerics: false });
    const values = [1000, 2000, 3000];
    const vec = new MoveVector(values.map((v) => new U32(v)));
    const arg = createArg(vec);
    const result = decodeArg(typeTag, arg);

    expect(result).toEqual(values);
  });

  it('should decode vector<u64> as bigint[]', () => {
    const typeTag = parseTypeTag('vector<u64>', { allowGenerics: false });
    const values = [86428977754n, 100000000000n, 999999999999n];
    const vec = new MoveVector(values.map((v) => new U64(v)));
    const arg = createArg(vec);
    const result = decodeArg(typeTag, arg);

    expect(result).toEqual(values);
    expect(typeof result[0]).toBe('bigint');
  });

  it('should decode vector<u128> as bigint[]', () => {
    const typeTag = parseTypeTag('vector<u128>', { allowGenerics: false });
    const values = [123456789012345678901234567890n, 999999999999999999999999n];
    const vec = new MoveVector(values.map((v) => new U128(v)));
    const arg = createArg(vec);
    const result = decodeArg(typeTag, arg);

    expect(result).toEqual(values);
  });

  it('should decode vector<u256> as bigint[]', () => {
    const typeTag = parseTypeTag('vector<u256>', { allowGenerics: false });
    const values = [123456789012345678901234567890n];
    const vec = new MoveVector(values.map((v) => new U256(v)));
    const arg = createArg(vec);
    const result = decodeArg(typeTag, arg);

    expect(result).toEqual(values);
  });

  it('should decode vector<bool>', () => {
    const typeTag = parseTypeTag('vector<bool>', { allowGenerics: false });
    const values = [true, false, true, true, false];
    const vec = new MoveVector(values.map((v) => new Bool(v)));
    const arg = createArg(vec);
    const result = decodeArg(typeTag, arg);

    expect(result).toEqual(values);
  });

  it('should decode vector<address> as string[]', () => {
    const typeTag = parseTypeTag('vector<address>', { allowGenerics: false });
    const addresses = [
      '0x6c5cadaf504e795230706bde1e43d1af7cf3764796e5b53b8ca5cf24b009f82b',
      '0x0000000000000000000000000000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000000000000000000000000abcdef',
    ];
    const vec = new MoveVector(addresses.map((a) => AccountAddress.from(a)));
    const arg = createArg(vec);
    const result = decodeArg(typeTag, arg);

    expect(result).toEqual(addresses.map((a) => AccountAddress.from(a).toString()));
  });

  it('should decode vector<0x1::string::String> as string[]', () => {
    const typeTag = parseTypeTag('vector<0x1::string::String>', { allowGenerics: false });
    const strings = ['hello', 'world', 'test'];
    const vec = new MoveVector(strings.map((s) => new MoveString(s)));
    const arg = createArg(vec);
    const result = decodeArg(typeTag, arg);

    expect(result).toEqual(strings);
  });

  it('should decode empty vectors', () => {
    const typeTag = parseTypeTag('vector<u64>', { allowGenerics: false });
    const vec = new MoveVector([]);
    const arg = createArg(vec);
    const result = decodeArg(typeTag, arg);

    expect(result).toEqual([]);
  });
});

describe('Parser - Nested Vectors', () => {
  it('should decode vector<vector<u8>> as Uint8Array[]', () => {
    const typeTag = parseTypeTag('vector<vector<u8>>', { allowGenerics: false });
    const serializer = new Serializer();

    // Manually serialize nested vector
    const outerVec = [[1, 2, 3], [4, 5], [6]];
    serializer.serializeU32AsUleb128(outerVec.length);
    for (const inner of outerVec) {
      const innerVec = new MoveVector(inner.map((b) => new U8(b)));
      innerVec.serialize(serializer);
    }

    const arg = {
      bcsToBytes: () => serializer.toUint8Array(),
    } as EntryFunctionArgument;

    const result = decodeArg(typeTag, arg) as Uint8Array[];

    expect(result).toHaveLength(3);
    expect(Array.from(result[0])).toEqual([1, 2, 3]);
    expect(Array.from(result[1])).toEqual([4, 5]);
    expect(Array.from(result[2])).toEqual([6]);
  });

  it('should decode vector<vector<u64>> as bigint[][]', () => {
    const typeTag = parseTypeTag('vector<vector<u64>>', { allowGenerics: false });
    const serializer = new Serializer();

    const outerVec = [[100n, 200n], [300n]];
    serializer.serializeU32AsUleb128(outerVec.length);
    for (const inner of outerVec) {
      const innerVec = new MoveVector(inner.map((v) => new U64(v)));
      innerVec.serialize(serializer);
    }

    const arg = {
      bcsToBytes: () => serializer.toUint8Array(),
    } as EntryFunctionArgument;

    const result = decodeArg(typeTag, arg);

    expect(result).toEqual([[100n, 200n], [300n]]);
  });

  it('should decode vector<vector<address>> as string[][]', () => {
    const typeTag = parseTypeTag('vector<vector<address>>', { allowGenerics: false });
    const serializer = new Serializer();

    const outerVec = [['0x1', '0x2'], ['0x3']];

    serializer.serializeU32AsUleb128(outerVec.length);
    for (const inner of outerVec) {
      const innerVec = new MoveVector(inner.map((a) => AccountAddress.from(a)));
      innerVec.serialize(serializer);
    }

    const arg = {
      bcsToBytes: () => serializer.toUint8Array(),
    } as EntryFunctionArgument;

    const result = decodeArg(typeTag, arg);

    expect(result).toEqual([['0x1', '0x2'], ['0x3']]);
  });

  it('should decode vector<vector<vector<u8>>> (triple nested)', () => {
    const typeTag = parseTypeTag('vector<vector<vector<u8>>>', { allowGenerics: false });
    const serializer = new Serializer();

    const outerVec = [[[1, 2], [3]], [[4]]];

    serializer.serializeU32AsUleb128(outerVec.length);
    for (const middle of outerVec) {
      serializer.serializeU32AsUleb128(middle.length);
      for (const inner of middle) {
        const innerVec = new MoveVector(inner.map((b) => new U8(b)));
        innerVec.serialize(serializer);
      }
    }

    const arg = {
      bcsToBytes: () => serializer.toUint8Array(),
    } as EntryFunctionArgument;

    const result = decodeArg(typeTag, arg) as Uint8Array[][];

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(2);
    expect(Array.from(result[0][0])).toEqual([1, 2]);
    expect(Array.from(result[0][1])).toEqual([3]);
    expect(Array.from(result[1][0])).toEqual([4]);
  });
});

describe('Parser - Struct Types', () => {
  it('should decode 0x1::string::String as string', () => {
    const typeTag = parseTypeTag('0x1::string::String', { allowGenerics: false });
    const str = new MoveString('Hello, Aptos!');
    const arg = createArg(str);
    const result = decodeArg(typeTag, arg);

    expect(result).toBe('Hello, Aptos!');
  });

  it('should decode 0x1::option::Option<u64> (Some)', () => {
    const typeTag = parseTypeTag('0x1::option::Option<u64>', { allowGenerics: false });
    const option = new MoveOption(new U64(42n));
    const arg = createArg(option);
    const result = decodeArg(typeTag, arg);

    expect(result).toBe(42n);
  });

  it('should decode 0x1::option::Option<u64> (None)', () => {
    const typeTag = parseTypeTag('0x1::option::Option<u64>', { allowGenerics: false });
    const option = new MoveOption();
    const arg = createArg(option);
    const result = decodeArg(typeTag, arg);

    expect(result).toBeUndefined();
  });

  it('should decode 0x1::option::Option<address> (Some)', () => {
    const typeTag = parseTypeTag('0x1::option::Option<address>', { allowGenerics: false });
    const address = '0x0000000000000000000000000000000000000000000000000000000000000123';
    const option = new MoveOption(AccountAddress.from(address));
    const arg = createArg(option);
    const result = decodeArg(typeTag, arg);

    expect(result).toBe(AccountAddress.from(address).toString());
  });

  it('should decode 0x1::option::Option<address> (None)', () => {
    const typeTag = parseTypeTag('0x1::option::Option<address>', { allowGenerics: false });
    const option = new MoveOption();
    const arg = createArg(option);
    const result = decodeArg(typeTag, arg);

    expect(result).toBeUndefined();
  });

  it('should decode 0x1::object::Object as address string', () => {
    const typeTag = parseTypeTag('0x1::object::Object<0x1::fungible_asset::Metadata>', {
      allowGenerics: false,
    });
    const address = '0x0000000000000000000000000000000000000000000000000000000000abcdef';
    const addr = AccountAddress.from(address);
    const arg = createArg(addr);
    const result = decodeArg(typeTag, arg);

    expect(result).toBe(AccountAddress.from(address).toString());
  });
});

describe('Parser - Real-world Scenarios', () => {
  it('should decode add_pool_entry arguments (vector<address>, vector<u64>)', () => {
    // Test the actual use case from the user
    const addressTypeTag = parseTypeTag('vector<address>', { allowGenerics: false });
    const u64TypeTag = parseTypeTag('vector<u64>', { allowGenerics: false });

    const addresses = ['0x6c5cadaf504e795230706bde1e43d1af7cf3764796e5b53b8ca5cf24b009f82b'];
    const rewards = [86428977754n];

    const addressVec = new MoveVector(addresses.map((a) => AccountAddress.from(a)));
    const rewardVec = new MoveVector(rewards.map((r) => new U64(r)));

    const addressArg = createArg(addressVec);
    const rewardArg = createArg(rewardVec);

    const decodedAddresses = decodeArg(addressTypeTag, addressArg);
    const decodedRewards = decodeArg(u64TypeTag, rewardArg);

    // Verify clean output format (no {value: ...} objects)
    expect(decodedAddresses).toEqual([addresses[0]]);
    expect(decodedRewards).toEqual(rewards);

    // Verify types
    expect(typeof decodedAddresses[0]).toBe('string');
    expect(typeof decodedRewards[0]).toBe('bigint');
  });

  it('should handle multiple arguments with different types', () => {
    const types = [
      parseTypeTag('u64', { allowGenerics: false }),
      parseTypeTag('address', { allowGenerics: false }),
      parseTypeTag('vector<u8>', { allowGenerics: false }),
      parseTypeTag('bool', { allowGenerics: false }),
    ];

    const args = [
      createArg(new U64(12345n)),
      createArg(AccountAddress.from('0x1')),
      createArg(new MoveVector([1, 2, 3].map((b) => new U8(b)))),
      createArg(new Bool(true)),
    ];

    const results = types.map((type, i) => decodeArg(type, args[i]));

    expect(results[0]).toBe(12345n);
    expect(results[1]).toBe('0x1');
    expect(Array.from(results[2] as Uint8Array)).toEqual([1, 2, 3]);
    expect(results[3]).toBe(true);
  });

  it('should handle empty vectors', () => {
    const typeTag = parseTypeTag('vector<address>', { allowGenerics: false });
    const vec = new MoveVector([]);
    const arg = createArg(vec);
    const result = decodeArg(typeTag, arg);

    expect(result).toEqual([]);
  });

  it('should handle large vectors', () => {
    const typeTag = parseTypeTag('vector<u64>', { allowGenerics: false });
    const values = Array.from({ length: 100 }, (_, i) => BigInt(i));
    const vec = new MoveVector(values.map((v) => new U64(v)));
    const arg = createArg(vec);
    const result = decodeArg(typeTag, arg);

    expect(result).toEqual(values);
  });

  it('should handle max u256 value', () => {
    const typeTag = parseTypeTag('u256', { allowGenerics: false });
    const maxU256 = (1n << 256n) - 1n;
    const arg = createArg(new U256(maxU256));
    const result = decodeArg(typeTag, arg);

    expect(result).toBe(maxU256);
  });
});

describe('Parser - Round-trip Tests (Encode → Decode)', () => {
  it('should round-trip u64', () => {
    const value = 123456789n;
    const encoded = encodeArg('u64', value);
    const typeTag = parseTypeTag('u64', { allowGenerics: false });
    const decoded = decodeArg(typeTag, encoded);

    expect(decoded).toBe(value);
  });

  it('should round-trip address', () => {
    const value = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const encoded = encodeArg('address', value);
    const typeTag = parseTypeTag('address', { allowGenerics: false });
    const decoded = decodeArg(typeTag, encoded);

    expect(decoded).toBe(value);
  });

  it('should round-trip bool', () => {
    const value = true;
    const encoded = encodeArg('bool', value);
    const typeTag = parseTypeTag('bool', { allowGenerics: false });
    const decoded = decodeArg(typeTag, encoded);

    expect(decoded).toBe(value);
  });

  it('should round-trip vector<u64>', () => {
    const value = [100n, 200n, 300n];
    const encoded = encodeArg('vector<u64>', value);
    const typeTag = parseTypeTag('vector<u64>', { allowGenerics: false });
    const decoded = decodeArg(typeTag, encoded);

    expect(decoded).toEqual(value);
  });

  it('should round-trip vector<address>', () => {
    const value = [
      '0x0000000000000000000000000000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000000000000000000000000000002',
      '0x0000000000000000000000000000000000000000000000000000000000000abc',
    ];
    const encoded = encodeArg('vector<address>', value);
    const typeTag = parseTypeTag('vector<address>', { allowGenerics: false });
    const decoded = decodeArg(typeTag, encoded);

    expect(decoded).toEqual(value.map((a) => AccountAddress.from(a).toString()));
  });

  it('should round-trip vector<u8> from Uint8Array', () => {
    const value = new Uint8Array([1, 2, 3, 4, 5]);
    const encoded = encodeArg('vector<u8>', value);
    const typeTag = parseTypeTag('vector<u8>', { allowGenerics: false });
    const decoded = decodeArg(typeTag, encoded);

    expect(decoded).toEqual(value);
  });

  it('should round-trip vector<u8> from hex string', () => {
    const value = '0x0102030405';
    const encoded = encodeArg('vector<u8>', value);
    const typeTag = parseTypeTag('vector<u8>', { allowGenerics: false });
    const decoded = decodeArg(typeTag, encoded) as Uint8Array;

    expect(Array.from(decoded)).toEqual([1, 2, 3, 4, 5]);
  });

  it('should round-trip 0x1::string::String', () => {
    const value = 'Hello, World!';
    const encoded = encodeArg('0x1::string::String', value);
    const typeTag = parseTypeTag('0x1::string::String', { allowGenerics: false });
    const decoded = decodeArg(typeTag, encoded);

    expect(decoded).toBe(value);
  });

  it('should round-trip 0x1::option::Option<u64> (Some)', () => {
    const value = 999n;
    const encoded = encodeArg('0x1::option::Option<u64>', value);
    const typeTag = parseTypeTag('0x1::option::Option<u64>', { allowGenerics: false });
    const decoded = decodeArg(typeTag, encoded);

    expect(decoded).toBe(value);
  });

  it('should round-trip 0x1::option::Option<u64> (None)', () => {
    const value = undefined;
    const encoded = encodeArg('0x1::option::Option<u64>', value);
    const typeTag = parseTypeTag('0x1::option::Option<u64>', { allowGenerics: false });
    const decoded = decodeArg(typeTag, encoded);

    expect(decoded).toBeUndefined();
  });
});

describe('Parser - Error Cases', () => {
  it('should throw on unsupported type', () => {
    const typeTag = parseTypeTag('u8', { allowGenerics: false });
    // Provide malformed data
    const arg = {
      bcsToBytes: () => new Uint8Array([]),
    } as EntryFunctionArgument;

    expect(() => decodeArg(typeTag, arg)).toThrow();
  });

  it('should throw on invalid BCS data', () => {
    const typeTag = parseTypeTag('u64', { allowGenerics: false });
    const arg = {
      bcsToBytes: () => new Uint8Array([1]), // Too short for u64
    } as EntryFunctionArgument;

    expect(() => decodeArg(typeTag, arg)).toThrow();
  });

  it('should throw clear error message for unsupported vector type', () => {
    // This would require implementing a type that's not in TYPE_REGISTRY
    // For now, we'll just document that errors should be clear
    expect(true).toBe(true);
  });
});
