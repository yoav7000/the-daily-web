const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { loginRateLimiter } = require('../middleware/loginRateLimiter');

router.post('/login', loginRateLimiter, authController.login);
router.post('/logout', authController.logout);
// "Who am I?" is open to everyone: a guest gets { user: null } (not an error), since the page cannot read the
// httpOnly cookie and has to ask. Everything that needs a login is protected by authenticate in its own routes.
router.get('/me', authController.getMe);

module.exports = router;
