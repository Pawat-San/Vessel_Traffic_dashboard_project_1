const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../../config');
const authRepository = require('./auth.repository');
const { AuthenticationError } = require('../../utils/errors');
const logger = require('../../utils/logger');

class AuthService {
  /**
   * Hashes a token string using SHA-256 for safe database storage
   * @param {string} token 
   * @returns {string} Hashed token hex
   */
  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Authenticate a user by username and password
   */
  async login(username, password) {
    const user = authRepository.findByUsername(username);
    if (!user) {
      logger.warn(`Failed login attempt for non-existent or inactive user: ${username}`);
      throw new AuthenticationError('Invalid username or password');
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      logger.warn(`Failed login attempt for user: ${username} (incorrect password)`);
      throw new AuthenticationError('Invalid username or password');
    }

    // Generate tokens
    const accessToken = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.display_name,
      },
      config.jwt.secret,
      { expiresIn: config.jwt.accessExpiry }
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiry }
    );

    // Hash and store the refresh token
    const tokenHash = this.hashToken(refreshToken);
    authRepository.updateRefreshToken(user.id, tokenHash);

    logger.info(`User successfully logged in: ${user.username}`, { userId: user.id });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
      }
    };
  }

  /**
   * Generate a new access token using a valid refresh token
   */
  async refresh(refreshToken) {
    try {
      // 1. Verify token signature and expiration
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
      
      // 2. Fetch user
      const user = authRepository.findById(decoded.id);
      if (!user || user.is_active !== 1) {
        throw new AuthenticationError('User is no longer active or exists');
      }

      // 3. Verify token hash against database record
      // We retrieve the full user record including token hash
      const fullUser = authRepository.findByUsername(user.username);
      const tokenHash = this.hashToken(refreshToken);
      
      if (!fullUser.refresh_token_hash || fullUser.refresh_token_hash !== tokenHash) {
        logger.warn(`Refresh token mismatch for user ID: ${user.id}`);
        throw new AuthenticationError('Invalid refresh token');
      }

      // 4. Generate new access token
      const accessToken = jwt.sign(
        {
          id: user.id,
          username: user.username,
          role: user.role,
          displayName: user.display_name,
        },
        config.jwt.secret,
        { expiresIn: config.jwt.accessExpiry }
      );

      logger.info(`Access token refreshed for user: ${user.username}`, { userId: user.id });

      return { accessToken };
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      logger.error('Token refresh execution failed', { error: error.message });
      throw new AuthenticationError('Invalid or expired refresh token');
    }
  }

  /**
   * Log out user and revoke refresh token
   */
  async logout(userId) {
    authRepository.updateRefreshToken(userId, null);
    logger.info(`User logged out and session revoked: ID ${userId}`, { userId });
    return true;
  }
}

module.exports = new AuthService();
