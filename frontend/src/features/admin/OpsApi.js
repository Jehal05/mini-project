import { api, post } from '../../api/http.js'

export const adminOps = {
  queue: () => api('/admin/emergencies'),
  analytics: (days) => api(`/admin/analytics?days=${days}`),
  backup: () => api('/admin/backup'),
  checkBackup: (file) => post('/admin/backup/check', { file }),
  restore: (file, confirm) => post('/admin/backup/restore', { file, confirm }),
}
