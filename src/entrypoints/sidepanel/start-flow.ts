// What happens between pressing Start and asking the service worker to start (FR-007). Each step must be passed
// before anything is captured; deferred FR-028's headphones notice would be another step here.

export type StartStep = 'consent';

export function startSteps(settings: { consentReminder: boolean }): StartStep[] {
  return settings.consentReminder ? ['consent'] : [];
}
