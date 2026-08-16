export enum ApplicationStartupErrorCode {
  AddressInUse = 'EADDRINUSE',
  PermissionDenied = 'EACCES',
  ConnectionRefused = 'ECONNREFUSED',
  DatabaseUnavailable = 'P1001',
  ConfigurationInvalid = 'CONFIGURATION_ERROR',
  Unknown = 'UNKNOWN',
}
