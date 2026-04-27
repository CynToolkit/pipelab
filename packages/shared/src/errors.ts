/**
 * Defines standardized exit codes for the Pipelab CLI.
 */
export enum CLIExitCode {
  Success = 0,
  UnknownError = 1,
  PipelineNotFound = 2,
  InvalidPipelineFile = 3,
  PipelineExecutionError = 4,
  InvalidArguments = 5,
}
