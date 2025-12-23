/**
 * Federation Error Events
 * 
 * Simple event emitter pattern for showing federation errors across the app.
 * Hooks emit errors, Toast component listens and displays them.
 */

type FederationErrorHandler = (error: FederationError) => void;

export interface FederationError {
  action: string; // e.g., 'like', 'repost', 'follow', 'reply'
  message?: string;
  retry?: () => void;
}

// Simple event emitter
const listeners = new Set<FederationErrorHandler>();

/**
 * Emit a federation error (called from hooks)
 */
export function emitFederationError(error: FederationError) {
  listeners.forEach(handler => handler(error));
}

/**
 * Subscribe to federation errors (called from Toast component)
 */
export function onFederationError(handler: FederationErrorHandler): () => void {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

/**
 * Helper to create a retry-enabled error
 */
export function createFederationError(
  action: string,
  retry?: () => void,
  message?: string
): FederationError {
  return {
    action,
    message: message || `Failed to ${action}`,
    retry,
  };
}
