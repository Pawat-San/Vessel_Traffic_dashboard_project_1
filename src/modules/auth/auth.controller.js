const authService = require('./auth.service');
const { success } = require('../../utils/response');

class AuthController {
  /**
   * Handle user login request
   */
  async login(req, res, next) {
    try {
      const { username, password } = req.body;
      const result = await authService.login(username, password);
      
      // We can also set refresh token in HttpOnly cookies if desired for extra security,
      // but to match the frontend spec we will return it in the JSON body.
      res.status(200).json(success(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Handle access token refresh request
   */
  async refresh(req, res, next) {
    try {
      const { refreshToken } = req.body;
      const result = await authService.refresh(refreshToken);
      res.status(200).json(success(result));
    } catch (error) {
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
      res.status(200).json(success({ message: 'Logout successful' }));
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
