import { Router } from 'express';
import { ApiError } from '../utils/ApiError.js';
import * as c from '../controllers/profile.controller.js';
import { protect, validate } from '../middleware/index.js';
import { loadOwnPatient } from '../middleware/ownPatient.js';
import { uploadDocument, uploadPhoto } from '../middleware/upload.js';
import {
  SECTIONS, contactCreateSchema, contactOrderSchema, contactUpdateSchema, personalSchema, preferencesSchema,
  sectionCreateSchema, sectionUpdateSchema,
} from '../utils/profileSchemas.js';

/** Everything here acts on the signed-in patient's own record, taken from the token (never from the URL). */
const router = Router();
for (const name of ['itemId', 'contactId', 'docId']) {
  router.param(name, (_req, _res, next, value) => (/^[a-f\d]{24}$/i.test(value) ? next() : next(ApiError.notFound('Not found'))));
}
router.use(protect({ roles: ['patient'] }), loadOwnPatient);

router.get('/', c.getMe);
router.patch('/personal', validate(personalSchema), c.updatePersonal);
router.put('/preferences', validate(preferencesSchema), c.updatePreferences);

router.put('/photo', uploadPhoto, c.savePhoto);
router.get('/photo', c.getPhoto);
router.delete('/photo', c.deletePhoto);

for (const section of SECTIONS) {
  router.post(`/${section}`, validate(sectionCreateSchema(section)), c.addItem(section));
  router.patch(`/${section}/:itemId`, validate(sectionUpdateSchema(section)), c.updateItem(section));
  router.delete(`/${section}/:itemId`, c.deleteItem(section));
}

router.post('/contacts', validate(contactCreateSchema), c.addContact);
router.put('/contacts/order', validate(contactOrderSchema), c.reorderContacts);
router.patch('/contacts/:contactId', validate(contactUpdateSchema), c.updateContact);
router.delete('/contacts/:contactId', c.deleteContact);
router.post('/contacts/:contactId/test-alert', c.testAlert);

router.get('/documents', c.listDocuments);
router.post('/documents', uploadDocument, c.uploadDocument);
router.get('/documents/:docId/file', c.getDocumentFile);
router.delete('/documents/:docId', c.deleteDocument);

router.get('/qr', c.getQr);
router.post('/qr/regenerate', c.regenerateQr);

export default router;
