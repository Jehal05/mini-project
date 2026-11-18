// Reusable GeoJSON Point sub-schema. Coordinates are ALWAYS [longitude, latitude].
import mongoose from 'mongoose';

export const pointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
      required: true,
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (c) =>
          Array.isArray(c) &&
          c.length === 2 &&
          c[0] >= -180 && c[0] <= 180 && // longitude
          c[1] >= -90 && c[1] <= 90,     // latitude
        message: 'coordinates must be [longitude, latitude] within valid ranges',
      },
    },
  },
  { _id: false }
);
