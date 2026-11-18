// Hospital ranking settings (feature 59). Edit the weights here; they must add up to 100.
export const RANKING_WEIGHTS = Object.freeze({
  distance: 40, // closer is better
  cathLab: 20, // can open a blocked artery on site
  cardiologistOnDuty: 15,
  ccuBeds: 10, // coronary care unit beds free
  icuBeds: 5,
  alsAmbulances: 10, // advanced life support ambulances
});

// Beds/ambulances above these numbers earn no extra points.
export const RANKING_CAPS = Object.freeze({
  ccuBedsCap: 3,
  icuBedsCap: 5,
  alsCap: 2,
});

// How many hospitals are notified first.
export const TOP_N = 3;

// Radius steps used to suggest a wider search (km).
export const RADIUS_STEPS = Object.freeze([10, 20, 30]);
