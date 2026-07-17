/**
 * Polyfill for Promise.withResolvers() (ES2024, Node 22+).
 * Node.js 20 does not provide the native implementation, so keep this polyfill.
 */
export function withResolvers<T>(): PromiseWithResolvers<T> {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
