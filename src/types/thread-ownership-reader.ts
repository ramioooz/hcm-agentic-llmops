export type CanonicalThreadOwner = {
  employeeCode: string;
  bindingId: string;
};

export interface ThreadOwnershipReader {
  resolveCanonicalOwner(employeeCode: string): Promise<CanonicalThreadOwner | null>;
  findOwnerEmployeeCodeByThreadId(threadId: string): Promise<string | undefined>;
}
