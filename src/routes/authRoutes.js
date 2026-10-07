const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate, requireEditor } = require('../middleware/auth');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.getMe);

// User CRUD Management (Editor only)
router.post('/users', authenticate, requireEditor, authController.createUser);
router.get('/users', authenticate, requireEditor, authController.getAllUsers);
router.get('/users/:id', authenticate, requireEditor, authController.getUserById);
router.put('/users/:id', authenticate, requireEditor, authController.updateUser);
router.delete('/users/:id', authenticate, requireEditor, authController.deleteUser);

module.exports = router;
