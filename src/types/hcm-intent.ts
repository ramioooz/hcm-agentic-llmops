import type { z } from 'zod';
import type { hcmIntentSchema } from '../contracts/hcm-intent.contract';

export type HcmIntent = z.infer<typeof hcmIntentSchema>;
