/** Task 9: notification service entry point for other modules (`notify`) and the cron route (`processDeliveries`). */
export { notify, type NotifyInput, type NotifyResult } from './notify';
export { processDeliveries, type ProcessOptions, type ProcessResult } from './process';
export { createEmailSender, createPushSender, localLogEmailSender, type EmailSender, type PushSender } from './channels';
export { DEFAULT_CHANNELS, effectiveChannels, inQuietHours, mergePreferences, quietWindowEnd, resolveLanguage, type PreferencePatch } from './logic';
