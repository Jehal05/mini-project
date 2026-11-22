// All seed data is SIMULATED for demonstration. Hospital names are fictional demo names.
// Coordinates are approximate points around Pune, as [longitude, latitude].
export const hospitals = [
  { code: 'HT-H01', name: 'Demo Heart Institute, Viman Nagar', area: 'Viman Nagar', coords: [73.9143, 18.5679], cathLab: true, cardiologist: true, icu: 6, ccu: 4 },
  { code: 'HT-H02', name: 'Demo City Hospital, Shivajinagar', area: 'Shivajinagar', coords: [73.8475, 18.5308], cathLab: true, cardiologist: true, icu: 8, ccu: 5 },
  { code: 'HT-H03', name: 'Demo Cardiac Centre, Kothrud', area: 'Kothrud', coords: [73.8077, 18.5074], cathLab: true, cardiologist: false, icu: 5, ccu: 3 },
  { code: 'HT-H04', name: 'Demo General Hospital, Hadapsar', area: 'Hadapsar', coords: [73.926, 18.5089], cathLab: false, cardiologist: true, icu: 4, ccu: 2 },
  { code: 'HT-H05', name: 'Demo Medical Centre, Baner', area: 'Baner', coords: [73.7868, 18.559], cathLab: true, cardiologist: true, icu: 5, ccu: 4 },
  { code: 'HT-H06', name: 'Demo Community Hospital, Kharadi', area: 'Kharadi', coords: [73.9348, 18.5515], cathLab: false, cardiologist: false, icu: 3, ccu: 1 },
  { code: 'HT-H07', name: 'Demo Multispeciality Hospital, Pimpri', area: 'Pimpri', coords: [73.8009, 18.6279], cathLab: true, cardiologist: true, icu: 7, ccu: 4 },
  { code: 'HT-H08', name: 'Demo Emergency Hospital, Katraj', area: 'Katraj', coords: [73.8677, 18.4575], cathLab: false, cardiologist: true, icu: 3, ccu: 2 },
];

export const doctors = [
  { name: 'Dr. Demo Cardiologist A', hospitalCode: 'HT-H01', specialty: 'cardiologist', onDuty: true },
  { name: 'Dr. Demo Emergency A', hospitalCode: 'HT-H01', specialty: 'emergency', onDuty: true },
  { name: 'Dr. Demo Cardiologist B', hospitalCode: 'HT-H02', specialty: 'cardiologist', onDuty: true },
  { name: 'Dr. Demo Emergency B', hospitalCode: 'HT-H02', specialty: 'emergency', onDuty: true },
  { name: 'Dr. Demo Cardiologist C', hospitalCode: 'HT-H05', specialty: 'cardiologist', onDuty: true },
  { name: 'Dr. Demo Cardiologist D', hospitalCode: 'HT-H07', specialty: 'cardiologist', onDuty: true },
  { name: 'Dr. Demo Emergency C', hospitalCode: 'HT-H04', specialty: 'emergency', onDuty: true },
  { name: 'Dr. Demo Cardiologist E', hospitalCode: 'HT-H08', specialty: 'cardiologist', onDuty: true },
];

export const ambulances = [
  { vehicleNumber: 'MH12-DEMO-0101', type: 'ALS', hospitalCode: 'HT-H01' },
  { vehicleNumber: 'MH12-DEMO-0102', type: 'BLS', hospitalCode: 'HT-H01' },
  { vehicleNumber: 'MH12-DEMO-0201', type: 'ALS', hospitalCode: 'HT-H02' },
  { vehicleNumber: 'MH12-DEMO-0301', type: 'BLS', hospitalCode: 'HT-H03' },
  { vehicleNumber: 'MH12-DEMO-0501', type: 'ALS', hospitalCode: 'HT-H05' },
  { vehicleNumber: 'MH12-DEMO-0701', type: 'ALS', hospitalCode: 'HT-H07' },
];
