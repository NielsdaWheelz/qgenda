import { GlobalRegistrator } from "@happy-dom/global-registrator"

// Bun test preload: install a DOM on the global scope before any test (and @testing-library) imports,
// so component tests can render React into a real document.
const NativeRequest = globalThis.Request
const NativeResponse = globalThis.Response
const NativeHeaders = globalThis.Headers
const nativeFetch = globalThis.fetch

GlobalRegistrator.register()

// Hono/Bun server tests run in the same Bun process as component tests. Keep the native Fetch API
// classes so app.request/Bun.serve responses remain the runtime's Response objects.
globalThis.Request = NativeRequest
globalThis.Response = NativeResponse
globalThis.Headers = NativeHeaders
globalThis.fetch = nativeFetch
