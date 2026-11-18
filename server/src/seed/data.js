// Fictional demo data: 5 hospitals across Pune and 8 ambulances. No real hospitals or people.
// Coordinates are approximate area centres, written as [longitude, latitude].

export const hospitals = [
  {
    key: 'kothrud',
    name: 'Lotus Heart Institute (Demo)',
    address: 'Plot 12, Paud Road, Kothrud, Pune 411038',
    phone: '+91-20-0000-0101',
    location: { type: 'Point', coordinates: [73.8077, 18.5074] },
    capabilities: { cathLab: true, cardiologistOnDuty: true, icuBedsFree: 6, ccuBedsFree: 4 },
  },
  {
    key: 'shivajinagar',
    name: 'Riverside Multispeciality Hospital (Demo)',
    address: '45 University Road, Shivajinagar, Pune 411005',
    phone: '+91-20-0000-0102',
    location: { type: 'Point', coordinates: [73.8475, 18.5308] },
    // Has a cath lab but zero free CCU beds: useful for the "reject, try next hospital" demo.
    capabilities: { cathLab: true, cardiologistOnDuty: true, icuBedsFree: 2, ccuBedsFree: 0 },
  },
  {
    key: 'hinjewadi',
    name: 'TechPark Care Hospital (Demo)',
    address: 'Phase 1, Rajiv Gandhi Infotech Park, Hinjewadi, Pune 411057',
    phone: '+91-20-0000-0103',
    location: { type: 'Point', coordinates: [73.7389, 18.5913] },
    capabilities: { cathLab: false, cardiologistOnDuty: true, icuBedsFree: 4, ccuBedsFree: 2 },
  },
  {
    key: 'vimannagar',
    name: 'Airport Road Heart Centre (Demo)',
    address: '8 Nagar Road, Viman Nagar, Pune 411014',
    phone: '+91-20-0000-0104',
    location: { type: 'Point', coordinates: [73.9143, 18.5679] },
    capabilities: { cathLab: true, cardiologistOnDuty: true, icuBedsFree: 5, ccuBedsFree: 3 },
  },
  {
    key: 'hadapsar',
    name: 'Eastside General Hospital (Demo)',
    address: '21 Solapur Road, Hadapsar, Pune 411028',
    phone: '+91-20-0000-0105',
    location: { type: 'Point', coordinates: [73.926, 18.5089] },
    capabilities: { cathLab: false, cardiologistOnDuty: false, icuBedsFree: 3, ccuBedsFree: 1 },
  },
];

// Each ambulance is parked about 200 m from its hospital (offset in degrees).
export const ambulances = [
  { vehicleNumber: 'MH-12-HT-0001', type: 'ALS', hospitalKey: 'kothrud', offset: [0.002, 0.001],
    crew: [{ name: 'Ravi Kale', role: 'driver' }, { name: 'Sneha Joshi', role: 'paramedic' }] },
  { vehicleNumber: 'MH-12-HT-0002', type: 'BLS', hospitalKey: 'kothrud', offset: [-0.002, 0.001],
    crew: [{ name: 'Amol Pawar', role: 'driver' }, { name: 'Neha Desai', role: 'emt' }] },
  { vehicleNumber: 'MH-12-HT-0003', type: 'ALS', hospitalKey: 'shivajinagar', offset: [0.002, -0.001],
    crew: [{ name: 'Sagar Shinde', role: 'driver' }, { name: 'Pooja Kulkarni', role: 'paramedic' }] },
  { vehicleNumber: 'MH-12-HT-0004', type: 'BLS', hospitalKey: 'shivajinagar', offset: [-0.001, -0.002],
    crew: [{ name: 'Vikas More', role: 'driver' }, { name: 'Anjali Gaikwad', role: 'emt' }] },
  { vehicleNumber: 'MH-12-HT-0005', type: 'BLS', hospitalKey: 'hinjewadi', offset: [0.002, 0.002],
    crew: [{ name: 'Rahul Jadhav', role: 'driver' }, { name: 'Kavita Bhosale', role: 'emt' }] },
  { vehicleNumber: 'MH-12-HT-0006', type: 'ALS', hospitalKey: 'vimannagar', offset: [0.002, 0.001],
    crew: [{ name: 'Nitin Salunkhe', role: 'driver' }, { name: 'Meera Patil', role: 'paramedic' }] },
  { vehicleNumber: 'MH-12-HT-0007', type: 'ALS', hospitalKey: 'vimannagar', offset: [-0.002, 0.002],
    crew: [{ name: 'Ganesh Thorat', role: 'driver' }, { name: 'Shweta Mane', role: 'paramedic' }] },
  { vehicleNumber: 'MH-12-HT-0008', type: 'BLS', hospitalKey: 'hadapsar', offset: [0.001, -0.002],
    crew: [{ name: 'Sunil Chavan', role: 'driver' }, { name: 'Priti Deshmukh', role: 'emt' }] },
];
