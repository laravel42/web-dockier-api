/**
 * Heartbeat Service Client
 *
 * Cross-service facade over the observe service's heartbeats. Used by the
 * processes service, whose scheduled jobs can be monitored by one.
 */
export {
  createHeartbeat,
  deleteHeartbeat,
  setHeartbeatWaiting,
} from "../../services/observe/domain/heartbeats.js";
