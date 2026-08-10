import type { PromptInjectionRisk } from '../types/prompt-injection-risk';

const patterns: Array<{
  reasonCode: Extract<PromptInjectionRisk, { safe: false }>['reasonCode'];
  pattern: RegExp;
}> = [
  {
    reasonCode: 'INSTRUCTION_OVERRIDE',
    pattern:
      /\b(?:ignore|disregard|forget|override)\s+(?:(?:all|the)\s+)?(?:previous|prior|system|developer|hidden)\s+(?:instructions?|messages?|rules?)\b/i,
  },
  {
    reasonCode: 'PROMPT_DISCLOSURE',
    pattern:
      /\b(?:show|reveal|dump|disclose|print|repeat)\b.{0,80}\b(?:system\s+prompt|developer\s+message|hidden\s+instructions?|your\s+instructions?)\b/i,
  },
  {
    reasonCode: 'EVIDENCE_DELIMITER_ESCAPE',
    pattern: /<\/(?:evidence|context)>/i,
  },
  {
    reasonCode: 'ROLE_BOUNDARY_SPOOFING',
    pattern: /(?:^|\n)\s*(?:system|developer|assistant)\s*:|<\/?(?:system|developer|assistant)\b/i,
  },
  {
    reasonCode: 'TOOL_OR_DATA_EXFILTRATION',
    pattern:
      /\b(?:(?:call|invoke|execute|run|use)\s+(?:the\s+)?(?:tool|function|api)|(?:send|post|upload|exfiltrate)\b.{0,80}\b(?:data|records?|secrets?|tokens?|credentials?))\b/i,
  },
  {
    reasonCode: 'MALICIOUS_REDIRECT',
    pattern:
      /\b(?:instead|redirect|tell|ask)\b.{0,80}\b(?:visit|open|browse|go\s+to)\s+https?:\/\//i,
  },
];

export function evaluatePromptInjectionRisk(text: string): PromptInjectionRisk {
  const match = patterns.find(({ pattern }) => pattern.test(text));
  return match ? { safe: false, reasonCode: match.reasonCode } : { safe: true };
}
