// Single source of truth for real-time event names. Never type these as raw strings elsewhere.
export const EVENTS = Object.freeze({
  VITALS_UPDATE: 'vitals:update',
  DETECTION_NEW: 'detection:new',
  EMERGENCY_CREATED: 'emergency:created',
  HOSPITAL_ALERT: 'hospital:alert',
  EMERGENCY_ACCEPTED: 'emergency:accepted',
  EMERGENCY_REJECTED: 'emergency:rejected',
  AMBULANCE_POSITION: 'ambulance:position',
  AMBULANCE_STATUS: 'ambulance:status',
  EMERGENCY_ARRIVED: 'emergency:arrived',
  EMERGENCY_CLOSED: 'emergency:closed',
  // Added in Phase 9
  PREPARATION_UPDATE: 'preparation:update', // hospital preparation checklist changed (feature 69)
  CASE_UPDATE: 'case:update', // full refreshed case payload (doctor assigned, milestones, timer)
});

// Client -> server room control events.
export const ROOM_EVENTS = Object.freeze({
  JOIN: 'room:join',
  LEAVE: 'room:leave',
});

export const ROOM_TYPES = Object.freeze(['hospital', 'case', 'patient', 'doctor']);

export const ALL_EVENT_NAMES = Object.freeze(Object.values(EVENTS));
