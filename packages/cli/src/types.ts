export interface CliCommandPayload {
  id: string
  input: string
}

export interface CliResponsePayload {
  id: string
  result: unknown
}

export interface CliErrorPayload {
  id: string
  error: string
}
