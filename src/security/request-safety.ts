import type { RequestSafetyEvaluation } from '../types/request-safety-evaluation';

const unsafePatterns: Array<{
  reasonCode: Extract<RequestSafetyEvaluation, { isSafe: false }>['reasonCode'];
  pattern: RegExp;
}> = [
  {
    reasonCode: 'INSTRUCTION_OVERRIDE',
    pattern:
      /\b(?:ignore|disregard|forget)\s+(?:(?:all|the)\s+)?(?:previous|prior|system|developer)\s+instructions?\b/i,
  },
  {
    reasonCode: 'BULK_EMPLOYEE_DATA_REQUEST',
    pattern:
      /\b(?:dump|export|list|show|send|reveal|review)\b.{0,80}\b(?:every|all)\s+employee(?:\s+(?:record|data|detail)s?)?\b/i,
  },
  {
    reasonCode: 'SECURITY_CONTROL_BYPASS',
    pattern:
      /\b(?:bypass|disable|skip|circumvent)\b.{0,80}\b(?:authorization|authentication|security(?:\s+controls?|\s+checks?)?|guardrails?|access\s+controls?)\b/i,
  },
  {
    reasonCode: 'SYSTEM_PROMPT_DISCLOSURE',
    pattern:
      /\b(?:show|reveal|dump|disclose|print)\b.{0,80}\b(?:the\s+)?(?:system\s+prompt|system\s+message|hidden\s+instructions?|your\s+instructions?)\b/i,
  },
];

export function evaluateRequestSafety(query: string): RequestSafetyEvaluation {
  const match = unsafePatterns.find(({ pattern }) => pattern.test(query));

  return match ? { isSafe: false, reasonCode: match.reasonCode } : { isSafe: true };
}
