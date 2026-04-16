/** Map of function name → function signature. Users augment this via declaration merging. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RpcFunctions {}

export interface RpcClient {
  call<K extends keyof RpcFunctions>(
    fn: K,
    ...args: Parameters<RpcFunctions[K]>
  ): Promise<Awaited<ReturnType<RpcFunctions[K]>>>
}

declare global {
  const v43: RpcClient
}
