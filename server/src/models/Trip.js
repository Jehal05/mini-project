import mongoose from 'mongoose';

// One ambulance trip for one emergency case (features 74-80). The simulator keeps `metersAlong` and
// `position` up to date every tick, so after a server restart the trip carries on from where it was.
const legSchema = new mongoose.Schema(
  {
    name: { type: String, enum: ['to_patient', 'to_hospital'], required: true },
    coordinates: { type: [[Number]], default: [] }, // GeoJSON order: [lng, lat]
    lengthM: { type: Number, default: 0 },
    distanceKm: Number, // as reported by the routing provider (or the straight-line estimate)
    providerDurationMin: Number,
    etaSource: String, // osrm | mapbox | google | estimate
  },
  { _id: false },
);

const tripSchema = new mongoose.Schema(
  {
    emergencyCase: { type: mongoose.Schema.Types.ObjectId, ref: 'EmergencyCase', required: true, unique: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    ambulance: { type: mongoose.Schema.Types.ObjectId, ref: 'Ambulance', required: true, index: true },
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    stage: {
      type: String,
      enum: ['en_route', 'at_patient', 'patient_on_board', 'en_route_to_hospital', 'at_hospital'],
      default: 'en_route',
      index: true,
    },
    stageTimes: {
      en_route: Date,
      at_patient: Date,
      patient_on_board: Date,
      en_route_to_hospital: Date,
      at_hospital: Date,
    },
    legs: [legSchema],
    legIndex: { type: Number, default: 0 }, // 0 = to patient, 1 = to hospital
    metersAlong: { type: Number, default: 0 }, // progress along the active leg
    position: { lat: Number, lng: Number },
    speedKmh: Number,
    lastTickAt: Date, // used for the "tick only once" check
    endedAt: Date,
  },
  { timestamps: true },
);

export default mongoose.models.Trip || mongoose.model('Trip', tripSchema);
