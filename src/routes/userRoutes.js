const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate, requireEditor } = require('../middleware/auth');

// Managing accounts is for editors only
router.use(authenticate, requireEditor);

router.post('/', userController.createUser);
router.get('/', userController.getUsers);
router.get('/:id', userController.getUserById);
router.put('/:id', userController.updateUser);
router.delete('/:id', userController.deleteUser);

module.exports = router;
