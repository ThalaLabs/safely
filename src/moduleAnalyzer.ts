import {
  Aptos,
  WriteSetChange,
  WriteSetChangeWriteModule,
  MoveFunction,
  MoveStruct,
  MoveModuleBytecode,
} from '@aptos-labs/ts-sdk';
import { isWriteSetChangeWriteModule } from './utils.js';

export interface ModuleChange {
  address: string;
  moduleName: string;
  upgraded: boolean;
  newFunctions: string[];
  newStructs: string[];
}

export interface ModuleChangesByAddress {
  [address: string]: ModuleChange[];
}

function getNewFunctions(
  existingFunctions: MoveFunction[],
  newFunctions: MoveFunction[]
): string[] {
  const existingNames = new Set(existingFunctions.map((f) => f.name));

  return newFunctions.filter((f) => !existingNames.has(f.name)).map((f) => f.name);
}

function getNewStructs(existingStructs: MoveStruct[], newStructs: MoveStruct[]): string[] {
  const existingNames = new Set(existingStructs.map((s) => s.name));

  return newStructs.filter((s) => !existingNames.has(s.name)).map((s) => s.name);
}

export async function analyzeModuleChanges(
  aptos: Aptos,
  simulationChanges: WriteSetChange[]
): Promise<ModuleChangesByAddress> {
  const moduleChanges = simulationChanges.filter(isWriteSetChangeWriteModule);

  if (moduleChanges.length === 0) {
    return {};
  }

  const changesByAddress: ModuleChangesByAddress = {};

  // Group changes by address
  const addressToChanges = new Map<string, WriteSetChangeWriteModule[]>();
  for (const change of moduleChanges) {
    const existing = addressToChanges.get(change.address) || [];
    existing.push(change);
    addressToChanges.set(change.address, existing);
  }

  // Analyze changes for each address
  for (const [address, changes] of addressToChanges) {
    const moduleChangeList: ModuleChange[] = [];

    // Fetch existing modules for this address
    let existingModuleBytecodes: MoveModuleBytecode[] = [];
    try {
      existingModuleBytecodes = await aptos.getAccountModules({
        accountAddress: address,
      });
    } catch (error) {
      // Account might not exist yet (new account deployment)
      console.debug(`Could not fetch modules for ${address}:`, error);
    }

    // Create maps of existing modules by name for both bytecode and ABI
    const existingModuleMap = new Map<string, MoveModuleBytecode>();
    for (const moduleBytecode of existingModuleBytecodes) {
      if (moduleBytecode.abi) {
        existingModuleMap.set(moduleBytecode.abi.name, moduleBytecode);
      }
    }

    // Analyze each module change
    for (const change of changes) {
      const newBytecode = change.data.bytecode;
      const newModule = change.data.abi;
      const moduleName = newModule?.name || 'unknown';

      const existingModuleData = existingModuleMap.get(moduleName);

      if (!existingModuleData) {
        // This is a new module deployment
        moduleChangeList.push({
          address,
          moduleName,
          upgraded: false,
          newFunctions: [],
          newStructs: [],
        });
      } else {
        // Check if bytecode actually changed
        if (existingModuleData.bytecode === newBytecode) {
          // Bytecode hasn't changed, skip this module
          continue;
        }

        // This is a module upgrade with actual bytecode changes
        let newFunctions: string[] = [];
        let newStructs: string[] = [];

        if (newModule && existingModuleData.abi) {
          // Compare ABIs - only look for additions since removals aren't possible
          newFunctions = getNewFunctions(
            existingModuleData.abi.exposed_functions || [],
            newModule.exposed_functions || []
          );

          newStructs = getNewStructs(existingModuleData.abi.structs || [], newModule.structs || []);
        }

        moduleChangeList.push({
          address,
          moduleName,
          upgraded: true,
          newFunctions,
          newStructs,
        });
      }
    }

    changesByAddress[address] = moduleChangeList;
  }

  return changesByAddress;
}
