const authService = require('./auth.service');
const { success } = require('../../utils/response');
const config = require('../../config');
const jwt = require('jsonwebtoken');

const cookieOptions = {
  httpOnly: true, secure: config.isProd, sameSite: 'strict', path: '/api/auth',
};
function sendSession(res, result) {
  const { refreshToken, ...body } = result;
  if (refreshToken) {
    res.cookie('refresh_token', refreshToken, {
      ...cookieOptions, maxAge: Math.max(0, jwt.decode(refreshToken).exp * 1000 - Date.now()),
    });
  } else {
    res.clearCookie('refresh_token', cookieOptions);
  }
  res.set('Cache-Control', 'no-store');
  return res.status(200).json(success(body));
}

class AuthController {
  /**
   * Handle user login request
   */
  async login(req, res, next) {
    try {
      const { username, password } = req.body;
      const result = await authService.login(username, password, {
        ip_address: req.ip,
        user_agent: req.get('user-agent') || null,
      });
      
      sendSession(res, result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Handle access token refresh request
   */
  async refresh(req, res, next) {
    try {
      const refreshToken = req.cookies.refresh_token;
      const result = await authService.refresh(refreshToken, {
        ip_address: req.ip,
        user_agent: req.get('user-agent') || null,
      });
      sendSession(res, result);
    } catch (error) {
      if (error.statusCode === 401 || error.statusCode === 403) {
        res.clearCookie('refresh_token', cookieOptions);
      }
      next(error);
    }
  }

  /**
   * Handle user logout request
   */
  async logout(req, res, next) {
    try {
      // req.user is set by authenticate middleware
      await authService.logout(req.user.id);
      res.clearCookie('refresh_token', cookieOptions);
      res.status(200).json(success({ message: 'Logout successful' }));
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
