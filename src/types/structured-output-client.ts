import type { BaseMessageLike } from '@langchain/core/messages';

export type StructuredOutputClient = {
  withStructuredOutput(
    schema: unknown,
    options: { name: string; strict: boolean },
  ): { invoke(input: BaseMessageLike[]): Promise<unknown> };
};
