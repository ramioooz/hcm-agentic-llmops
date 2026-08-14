export type PromptInjectionRisk =
  | { safe: true }
  | {
      safe: false;
      reasonCode:
        | 'INSTRUCTION_OVERRIDE'
        | 'PROMPT_DISCLOSURE'
        | 'ROLE_BOUNDARY_SPOOFING'
        | 'EVIDENCE_DELIMITER_ESCAPE'
        | 'TOOL_OR_DATA_EXFILTRATION'
        | 'MALICIOUS_REDIRECT';
    };
