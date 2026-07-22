/**
 * Internal Domain Event Bus
 *
 * Lightweight pub/sub for decoupling cross-service communication.
 * Services emit events without knowing who handles them; subscribers
 * (e.g. the notifications service) register handlers at startup.
 *
 * Design choices:
 * - Handlers run fire-and-forget (errors are logged, never propagated to emitters)
 * - Typed event map ensures compile-time safety on both emit and subscribe
 * - No external dependencies — just a typed wrapper around arrays of callbacks
 *
 * For horizontal scaling, this can be replaced with a message broker
 * (SQS, Redis pub/sub) without changing caller code.
 */

import { logger } from "./logger.js";

// ─── Event Definitions ─────────────────────────────────────────────

/**
 * Notification metadata payload.
 * Kept intentionally loose here — the notifications service validates
 * the metadata shape internally. This allows new metadata kinds to be
 * added without updating the event bus type.
 */
export interface NotifyEventMetadata {
  kind?: string;
  repo?: string;
  branch?: string;
  commit?: string;
  appUrl?: string;
  deployId?: string;
  projectId?: string;
  scanId?: string;
  summary?: {
    errors?: number;
    warnings?: number;
    infos?: number;
    totalFindings?: number;
  };
  [key: string]: unknown;
}

export interface NotifyEvent {
  tenantId: string;
  title: string;
  message: string;
  metadata?: NotifyEventMetadata;
}

export interface TenantCreatedEvent {
  tenantId: string;
}

export interface DomainEventMap {
  "notification:send": NotifyEvent;
  "tenant:created": TenantCreatedEvent;
}

// ─── Event Bus Implementation ──────────────────────────────────────

type Handler<T> = (event: T) => void | Promise<void>;

type Listeners = {
  [K in keyof DomainEventMap]?: Handler<DomainEventMap[K]>[];
};

const listeners: Listeners = {};

/**
 * Subscribe to a domain event.
 * Returns an unsubscribe function (useful for testing).
 */
export function on<K extends keyof DomainEventMap>(
  eventName: K,
  handler: Handler<DomainEventMap[K]>,
): () => void {
  if (!listeners[eventName]) {
    listeners[eventName] = [];
  }
  listeners[eventName]!.push(handler);

  return () => {
    const handlers = listeners[eventName];
    if (!handlers) return;
    const idx = handlers.indexOf(handler);
    if (idx !== -1) handlers.splice(idx, 1);
  };
}

/**
 * Emit a domain event. All handlers run asynchronously (fire-and-forget).
 * Errors in handlers are logged but never propagated to the emitter.
 */
export function emit<K extends keyof DomainEventMap>(
  eventName: K,
  event: DomainEventMap[K],
): void {
  const handlers = listeners[eventName];
  if (!handlers || handlers.length === 0) return;

  for (const handler of handlers) {
    try {
      const result = handler(event);
      if (result && typeof result === "object" && "catch" in result) {
        (result as Promise<void>).catch((err) => {
          logger.error({ err, eventName }, `[events] Handler failed for ${eventName}`);
        });
      }
    } catch (err) {
      logger.error({ err, eventName }, `[events] Sync handler threw for ${eventName}`);
    }
  }
}

/**
 * Remove all listeners. Useful for test cleanup.
 */
export function clearAllListeners(): void {
  for (const key of Object.keys(listeners)) {
    delete listeners[key as keyof DomainEventMap];
  }
}
