import { api, del, getBlob, patch, post, put, upload } from '../../api/http.js';

const ME = '/patients/me';

export const profileApi = {
  get: () => api(ME),
  savePersonal: (body) => patch(`${ME}/personal`, body),
  savePreferences: (body) => put(`${ME}/preferences`, body),
  uploadPhoto: (file) => { const f = new FormData(); f.append('photo', file); return upload(`${ME}/photo`, f, 'PUT'); },
  deletePhoto: () => del(`${ME}/photo`),
  photoBlob: () => getBlob(`${ME}/photo`),

  addItem: (section, body) => post(`${ME}/${section}`, body),
  updateItem: (section, id, body) => patch(`${ME}/${section}/${id}`, body),
  confirmNone: (section) => put(`${ME}/${section}/confirm-none`),
  deleteItem: (section, id) => del(`${ME}/${section}/${id}`),

  addContact: (body) => post(`${ME}/contacts`, body),
  updateContact: (id, body) => patch(`${ME}/contacts/${id}`, body),
  deleteContact: (id) => del(`${ME}/contacts/${id}`),
  reorderContacts: (order) => put(`${ME}/contacts/order`, { order }),
  testAlert: (id) => post(`${ME}/contacts/${id}/test-alert`, {}),

  listDocuments: () => api(`${ME}/documents`),
  uploadDocument: (file, type) => { const f = new FormData(); f.append('type', type); f.append('file', file); return upload(`${ME}/documents`, f); },
  documentBlob: (id) => getBlob(`${ME}/documents/${id}/file`),
  deleteDocument: (id) => del(`${ME}/documents/${id}`),

  dischargeSummary: (id) => api(`${ME}/discharge-summaries/${id}`),

  getQr: () => api(`${ME}/qr`),
  regenerateQr: () => post(`${ME}/qr/regenerate`, {}),
};

/** Public passport calls need no login (auth: false), so they work for a stranger who scanned the QR. */
export const passportApi = {
  scan: (token) => api(`/passport/${token}`, { auth: false }),
  report: (token, body) => post(`/passport/${token}/report`, body, { auth: false }),
  full: (token) => api(`/passport/${token}/full`),
  fullDocumentBlob: (token, id) => getBlob(`/passport/${token}/full/documents/${id}/file`),
  fullPhotoBlob: (token) => getBlob(`/passport/${token}/photo`, { auth: false }),
};
