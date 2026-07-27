/**
 * Activity Recording Service Client
 *
 * Cross-service facade for recording project activity events.
 * Used by commands and projects services to log user actions
 * without depending directly on the observe service's domain layer.
 */

export { safeRecordActivity } from "../../services/observe/domain/activity.js";
