import { SimpleEntryFunctionArgumentTypes } from '@aptos-labs/ts-sdk';

type TemplateFunction = (typeArgs: string[], args: SimpleEntryFunctionArgumentTypes[]) => string;

// TODO: rework

export const transactionTemplates: Record<string, TemplateFunction> = {
  '0x024c90c44edf46aa02c3e370725b918a59c52b5aa551388feb258bd5a1e82271::isolated_lending::create_pair_with_jump_model_fa_entry':
    (_typeArgs, args) =>
      JSON.stringify(
        {
          collateral: args[0],
          liability: args[1],
          ltv: Number(args[2]),
          liquidationIncentive: Number(args[3]),
          initialLiquidity: Number(args[4]),
          baseRate: Number(args[5]),
          multiplier: Number(args[6]),
          jumpMultiplier: Number(args[7]),
          optimalUtilizationRate: Number(args[8]),
          collateralDust: Number(args[9]),
        },
        null,
        2
      ),
  // Add more as needed
};

export function getTransactionExplanation(
  functionId: string,
  typeArgs: string[],
  args: SimpleEntryFunctionArgumentTypes[]
): string {
  const template = transactionTemplates[functionId];
  if (!template) {
    return `Call ${functionId}`; // Default explanation
  }
  return template(typeArgs, args);
}
