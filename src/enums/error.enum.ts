export enum CommonErrorCode {
  InternalError = 'INTERNAL_ERROR',
  AuthenticationRequired = 'AUTHENTICATION_REQUIRED',
  AuthorizationDenied = 'AUTHORIZATION_DENIED',
  EmployeeNotFound = 'EMPLOYEE_NOT_FOUND',
  EmployeeInactive = 'EMPLOYEE_INACTIVE',
  OnboardingReviewNotFound = 'ONBOARDING_REVIEW_NOT_FOUND',
  ValidationError = 'VALIDATION_ERROR',
  InvalidThreadId = 'INVALID_THREAD_ID',
  AgentUnavailable = 'AGENT_UNAVAILABLE',
  PayloadTooLarge = 'PAYLOAD_TOO_LARGE',
}

export enum AgentErrorCode {
  GraphResultMissing = 'GRAPH_RESULT_MISSING',
  GraphReviewMissing = 'GRAPH_REVIEW_MISSING',
  GraphEmployeeCodeMissing = 'GRAPH_EMPLOYEE_CODE_MISSING',
  GraphLookupMissing = 'GRAPH_LOOKUP_MISSING',
  GraphResultContextMissing = 'GRAPH_RESULT_CONTEXT_MISSING',
  GraphCommandInvalid = 'GRAPH_COMMAND_INVALID',
  GraphIntentMissing = 'GRAPH_INTENT_MISSING',
  ModelUnavailable = 'MODEL_UNAVAILABLE',
  UnsafeRequestRejected = 'UNSAFE_REQUEST_REJECTED',
  ThreadIdentityMismatch = 'THREAD_IDENTITY_MISMATCH',
}

export enum KnowledgeErrorCode {
  ExternalProcessingDisabled = 'RAG_EXTERNAL_PROCESSING_DISABLED',
  FileTypeUnsupported = 'KNOWLEDGE_FILE_TYPE_UNSUPPORTED',
  ExtractionLimitExceeded = 'KNOWLEDGE_EXTRACTION_LIMIT_EXCEEDED',
  FileSizeInvalid = 'KNOWLEDGE_FILE_SIZE_INVALID',
  TitleInvalid = 'KNOWLEDGE_TITLE_INVALID',
  TextEmpty = 'KNOWLEDGE_TEXT_EMPTY',
  DocumentUnsafe = 'KNOWLEDGE_DOCUMENT_UNSAFE',
  EmbeddingFailed = 'KNOWLEDGE_EMBEDDING_FAILED',
  EmbeddingCountMismatch = 'EMBEDDING_COUNT_MISMATCH',
  EmbeddingDimensionMismatch = 'EMBEDDING_DIMENSION_MISMATCH',
  DatabaseWriteFailed = 'KNOWLEDGE_DATABASE_WRITE_FAILED',
  DatabaseReadFailed = 'KNOWLEDGE_DATABASE_READ_FAILED',
  FileReadFailed = 'KNOWLEDGE_FILE_READ_FAILED',
  IndexFailed = 'KNOWLEDGE_INDEX_FAILED',
  QueryInvalid = 'KNOWLEDGE_QUERY_INVALID',
  UnsafeQuery = 'UNSAFE_KNOWLEDGE_QUERY',
  QueryFailed = 'KNOWLEDGE_QUERY_FAILED',
  SourcePathInvalid = 'KNOWLEDGE_SOURCE_PATH_INVALID',
  DocumentNotFound = 'KNOWLEDGE_DOCUMENT_NOT_FOUND',
  VersionActivationConflict = 'KNOWLEDGE_VERSION_ACTIVATION_CONFLICT',
  InsufficientEvidence = 'INSUFFICIENT_EVIDENCE',
  UngroundedExternalUrl = 'UNGROUNDED_EXTERNAL_URL',
  LangSmithTraceFailed = 'LANGSMITH_RAG_TRACE_FAILED',
}

export enum LeaveErrorCode {
  InvalidDates = 'INVALID_LEAVE_DATES',
  InvalidApprovalDecision = 'INVALID_APPROVAL_DECISION',
  ContextMissing = 'LEAVE_CONTEXT_MISSING',
  RequestPersistenceFailed = 'LEAVE_REQUEST_PERSISTENCE_FAILED',
  PolicyNotFound = 'LEAVE_POLICY_NOT_FOUND',
  BalanceNotFound = 'LEAVE_BALANCE_NOT_FOUND',
  DocumentNotFound = 'LEAVE_DOCUMENT_NOT_FOUND',
  ProposalChanged = 'LEAVE_PROPOSAL_CHANGED',
}

export enum TriggerErrorCode {
  EventIdConflict = 'EVENT_ID_CONFLICT',
  WorkflowFailed = 'WORKFLOW_FAILED',
  ProcessedEventStateUnavailable = 'PROCESSED_EVENT_STATE_UNAVAILABLE',
  RabbitMqNotStarted = 'RABBITMQ_NOT_STARTED',
  EventValidationError = 'EVENT_VALIDATION_ERROR',
  EventPublishFailed = 'EVENT_PUBLISH_FAILED',
  WebhookUnauthorized = 'WEBHOOK_UNAUTHORIZED',
  WebhookValidationError = 'WEBHOOK_VALIDATION_ERROR',
}
