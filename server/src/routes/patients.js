import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { authenticate } from '../auth/guard.js';
import * as svc from '../patients/service.js';
import { SECTIONS, isObjectIdString, validateMood, validateContact, validateContactOrder, validatePersonal, validatePreferences, validateSection } from '../patients/validate.js';
import { sendFile } from './fileResponse.js';

// Everything here acts on the signed-in patient's own record. The record id comes from the token, never from the URL,
// so one patient can never reach another's record.
const router = Router();
for (const name of ['itemId', 'contactId', 'docId']) {
  router.param(name, (_req, _res, next, v) => (isObjectIdString(v) ? next() : next(httpError(404, 'Not found'))));
}

const patientOnly = [authenticate, (req, _res, next) => (req.user.role === 'patient' ? next() : next(Object.assign(httpError(403, 'Patient access only'), { code: 'ROLE_FORBIDDEN' })))];
router.use(patientOnly);

const h = (fn) => asyncHandler(async (req, res) => res.json({ patient: await fn(req) }));

router.get('/', h((req) => svc.getOwn(req.user)));
router.patch('/personal', h((req) => svc.updatePersonal(req.user, validatePersonal(req.body))));
router.put('/preferences', h((req) => svc.updatePreferences(req.user, validatePreferences(req.body))));

router.put('/photo', h((req) => svc.savePhoto(req.user, req.body)));
router.delete('/photo', h((req) => svc.deletePhoto(req.user)));
router.get('/photo', asyncHandler(async (req, res) => sendFile(res, await svc.getPhoto(req.user))));

for (const section of SECTIONS) {
  router.post(`/${section}`, asyncHandler(async (req, res) => res.status(201).json({ patient: await svc.addItem(req.user, section, validateSection(section, req.body, { partial: false })) })));
  router.patch(`/${section}/:itemId`, h((req) => svc.updateItem(req.user, section, req.params.itemId, validateSection(section, req.body, { partial: true }))));
  router.delete(`/${section}/:itemId`, h((req) => svc.deleteItem(req.user, section, req.params.itemId)));
}

router.post('/contacts', asyncHandler(async (req, res) => res.status(201).json({ patient: await svc.addContact(req.user, validateContact(req.body, { create: true })) })));
router.put('/contacts/order', h((req) => svc.reorderContacts(req.user, validateContactOrder(req.body).order)));
router.patch('/contacts/:contactId', h((req) => svc.updateContact(req.user, req.params.contactId, validateContact(req.body, { create: false }))));
router.delete('/contacts/:contactId', h((req) => svc.deleteContact(req.user, req.params.contactId)));
router.post('/contacts/:contactId/test-alert', asyncHandler(async (req, res, next) => {
  try { res.json(await svc.testAlert(req.user, req.params.contactId)); } catch (e) { if (e.retryAfter) res.set('Retry-After', String(e.retryAfter)); next(e); }
}));

router.get('/documents', asyncHandler(async (req, res) => res.json({ documents: await svc.listDocuments(req.user) })));
router.post('/documents', asyncHandler(async (req, res) => res.status(201).json({ document: await svc.uploadDocument(req.user, req.body) })));
router.get('/documents/:docId/file', asyncHandler(async (req, res) => sendFile(res, await svc.getDocument(req.user, req.params.docId))));
router.delete('/documents/:docId', asyncHandler(async (req, res) => res.json(await svc.deleteDocument(req.user, req.params.docId))));

router.get('/mood', asyncHandler(async (req, res) => res.json({ moods: await svc.listMoods(req.user) })));
router.post('/mood', asyncHandler(async (req, res) => res.status(201).json({ mood: await svc.addMood(req.user, validateMood(req.body)) })));

router.get('/qr', asyncHandler(async (req, res) => res.json(await svc.getQr(req.user))));
router.post('/qr/regenerate', asyncHandler(async (req, res) => res.json(await svc.regenerateQr(req.user))));

export default router;
