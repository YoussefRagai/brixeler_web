// Compatibility endpoint for clients that use the explicit restore path.
// The canonical handler remains next to the history endpoint so both routes
// share the same authorization, validation, and service-only restore RPC.
export { POST } from "../route";
