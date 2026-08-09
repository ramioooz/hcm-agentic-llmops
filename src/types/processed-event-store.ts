export type ProcessedEventClaim = {
  status: 'CLAIMED' | 'DUPLICATE_COMPLETED' | 'DUPLICATE_IN_PROGRESS' | 'CONFLICT';
};

export type ProcessedEventClaimInput = {
  eventId: string;
  type: string;
  payloadHash: string;
  correlationId: string;
  attempt: number;
};

export type ProcessedEventStore = {
  claim(input: ProcessedEventClaimInput): Promise<ProcessedEventClaim>;
  complete(input: { eventId: string; runId: string; threadId?: string }): Promise<void>;
  fail(input: { eventId: string; errorCode: string }): Promise<void>;
};
