// Demo data for the hospital portal. Everything here is fictional.

export const HOSPITAL = {
  id: 'HOSP-01',
  name: 'HealthTwin City Hospital',
  area: 'Shivajinagar, Pune',
  lat: 18.5308,
  lng: 73.8475,
}

export const INITIAL_BEDS = {
  icu: { label: 'ICU', total: 12, occupied: 8 },
  emergency: { label: 'Emergency ward', total: 20, occupied: 13 },
  general: { label: 'General ward', total: 80, occupied: 57 },
}

// Each emergency pulls the patient's vitals towards `target`.
export const CONDITIONS = {
  'heart-attack': {
    label: 'Heart attack',
    priority: 'critical',
    bed: 'icu',
    target: { hr: 138, spo2: 89, sys: 168, dia: 104, rr: 26 },
  },
  stroke: {
    label: 'Stroke',
    priority: 'critical',
    bed: 'icu',
    target: { hr: 96, spo2: 94, sys: 192, dia: 116, rr: 20 },
  },
  diabetic: {
    label: 'Diabetic emergency',
    priority: 'high',
    bed: 'emergency',
    target: { hr: 114, glucose: 46, rr: 22 },
  },
  asthma: {
    label: 'Asthma attack',
    priority: 'high',
    bed: 'emergency',
    target: { hr: 124, spo2: 86, rr: 32 },
  },
}

export const PATIENTS = [
  {
    id: 'P-001',
    name: 'Aarav Sharma',
    age: 58,
    gender: 'Male',
    blood: 'B+',
    history: ['Hypertension'],
    area: 'Kothrud',
    lat: 18.5074,
    lng: 73.8077,
    baseline: { hr: 76, spo2: 98, sys: 132, dia: 86, glucose: 108, rr: 16, temp: 36.8 },
  },
  {
    id: 'P-002',
    name: 'Meera Iyer',
    age: 64,
    gender: 'Female',
    blood: 'O+',
    history: ['Type 2 diabetes'],
    area: 'Aundh',
    lat: 18.559,
    lng: 73.8075,
    baseline: { hr: 82, spo2: 97, sys: 126, dia: 80, glucose: 142, rr: 17, temp: 36.7 },
  },
  {
    id: 'P-003',
    name: 'Rohan Deshmukh',
    age: 52,
    gender: 'Male',
    blood: 'A+',
    history: ['High cholesterol', 'Smoker'],
    area: 'Viman Nagar',
    lat: 18.5679,
    lng: 73.9143,
    baseline: { hr: 78, spo2: 97, sys: 136, dia: 88, glucose: 104, rr: 16, temp: 36.9 },
  },
  {
    id: 'P-004',
    name: 'Sneha Kulkarni',
    age: 34,
    gender: 'Female',
    blood: 'AB+',
    history: ['Asthma'],
    area: 'Hadapsar',
    lat: 18.5089,
    lng: 73.926,
    baseline: { hr: 72, spo2: 98, sys: 116, dia: 74, glucose: 96, rr: 15, temp: 36.6 },
  },
  {
    id: 'P-005',
    name: 'Vikram Joshi',
    age: 71,
    gender: 'Male',
    blood: 'O-',
    history: ['Atrial fibrillation'],
    area: 'Baner',
    lat: 18.559,
    lng: 73.7868,
    baseline: { hr: 80, spo2: 96, sys: 130, dia: 82, glucose: 112, rr: 18, temp: 36.7 },
  },
]

export const AMBULANCES = [
  { id: 'AMB-01', crew: 'R. Patil, S. Khan', station: 'Hospital bay', lat: 18.5308, lng: 73.8475 },
  { id: 'AMB-02', crew: 'A. More, P. Nair', station: 'Kalyani Nagar post', lat: 18.5463, lng: 73.9033 },
  { id: 'AMB-03', crew: 'K. Jadhav, M. Das', station: 'Warje post', lat: 18.4844, lng: 73.8 },
]

// One patient has a heart attack a few seconds into the demo; the other four stay normal.
export const SCRIPTED_EVENT = { atTick: 15, patientId: 'P-003', condition: 'heart-attack' }
