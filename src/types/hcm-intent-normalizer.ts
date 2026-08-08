import type { HcmIntent } from './hcm-intent';

export type HcmIntentNormalizer = {
  normalize(query: string): Promise<HcmIntent>;
};
