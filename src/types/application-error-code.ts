import type {
  AgentErrorCode,
  CommonErrorCode,
  KnowledgeErrorCode,
  LeaveErrorCode,
  TriggerErrorCode,
} from '../enums/error.enum';

export type ApplicationErrorCode =
  | CommonErrorCode
  | AgentErrorCode
  | KnowledgeErrorCode
  | LeaveErrorCode
  | TriggerErrorCode;
