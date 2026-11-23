import { api, del, getBlob, patch, post, upload } from '../../api/http.js';

const H = '/hospital';

export const hospitalApi = {
  me: () => api(`${H}/me`),
  dashboard: () => api(`${H}/dashboard`),

  doctors: () => api(`${H}/doctors`),
  addDoctor: (b) => post(`${H}/doctors`, b),
  updateDoctor: (id, b) => patch(`${H}/doctors/${id}`, b),

  beds: () => api(`${H}/beds`),
  addBed: (b) => post(`${H}/beds`, b),
  addBeds: (b) => post(`${H}/beds/bulk`, b),
  setBed: (id, status) => patch(`${H}/beds/${id}`, { status }),
  deleteBed: (id) => del(`${H}/beds/${id}`),

  ed: () => api(`${H}/ed`),
  addBay: (label) => post(`${H}/ed/bays`, { label }),
  bayAction: (id, body) => patch(`${H}/ed/bays/${id}`, body),
  deleteBay: (id) => del(`${H}/ed/bays/${id}`),

  history: (params = {}) => api(`${H}/history?${new URLSearchParams(params)}`),

  admissions: (status = 'admitted') => api(`${H}/admissions?status=${status}`),
  admit: (b) => post(`${H}/admissions`, b),
  admission: (id) => api(`${H}/admissions/${id}`),
  record: (id) => api(`${H}/admissions/${id}/record`),

  records: (id) => api(`${H}/admissions/${id}/records`),
  addRecord: (id, b) => post(`${H}/admissions/${id}/records`, b),
  addRecordFile: (id, file, kind, title) => { const f = new FormData(); f.append('kind', kind); if (title) f.append('title', title); f.append('file', file); return upload(`${H}/admissions/${id}/records/file`, f); },
  recordFile: (id, recordId) => getBlob(`${H}/admissions/${id}/records/${recordId}/file`),

  prescriptions: (id) => api(`${H}/admissions/${id}/prescriptions`),
  checkDrug: (id, drug) => api(`${H}/admissions/${id}/prescriptions/check?drug=${encodeURIComponent(drug)}`),
  prescribe: (id, b) => post(`${H}/admissions/${id}/prescriptions`, b),

  discharge: (id) => api(`${H}/admissions/${id}/discharge`),
  finalize: (id, b) => post(`${H}/admissions/${id}/discharge`, b),
};

export const adminApi = {
  hospitals: () => api('/admin/hospitals'),
  createHospital: (b) => post('/admin/hospitals', b),
  updateHospital: (id, b) => patch(`/admin/hospitals/${id}`, b),
};
