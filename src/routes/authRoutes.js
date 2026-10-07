const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate, requireEditor } = require('../middleware/auth');

router.post('/register', authController.register);
router.post('/users', authenticate, requireEditor, authController.createUser);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.getMe);

module.exports = router;
