const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../../config');
const authRepository = require('./auth.repository');
const { hashPassword, verifyPassword, isLegacyHash } = require('../../utils/password');
const { isPasswordExpired } = require('../../utils/passwordPolicy');
const { AuthenticationError, PasswordChangeRequiredError } = require('../../utils/errors');
const logger = require('../../utils/logger');
const userActivityService = require('../users/userActivity.service');

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
  async login(username, password, metadata = {}) {
    const user = await authRepository.findByUsername(username);
    if (!user) {
      logger.warn(`Failed login attempt for non-existent or inactive user: ${username}`);
      throw new AuthenticationError('Invalid username or password');
    }

    const isMatch = await verifyPassword(password, user.password_hash);
    if (!isMatch) {
      logger.warn(`Failed login attempt for user: ${username} (incorrect password)`);
      throw new AuthenticationError('Invalid username or password');
    }

    // Lazily migrate legacy bcrypt hashes to Argon2 on successful login
    if (isLegacyHash(user.password_hash)) {
      const newHash = await hashPassword(password);
      await authRepository.updatePasswordHash(user.id, newHash);
      logger.info(`Migrated password hash to argon2 for user: ${user.username}`, { userId: user.id });
    }

    const passwordExpired = isPasswordExpired(user.password_changed_at, config.password.maxAgeDays);
    const mustChangePassword = Boolean(user.must_change_password) || passwordExpired;

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
    await userActivityService.recordSuccessfulLogin(user, {
      ...metadata,
      occurred_at: new Date().toISOString(),
    }, tokenHash);

    logger.info(`User successfully logged in: ${user.username}`, { userId: user.id });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        mustChangePassword,
        passwordExpired,
      }
    };
  }

  /**
   * Generate a new access token using a valid refresh token
   */
  async refresh(refreshToken, metadata = {}) {
    try {
      // 1. Verify token signature and expiration
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);

      // 2. Fetch user
      const user = await authRepository.findById(decoded.id);
      if (!user || user.is_active !== 1) {
        throw new AuthenticationError('User is no longer active or exists');
      }

      const passwordExpired = isPasswordExpired(user.password_changed_at, config.password.maxAgeDays);
      if (user.must_change_password || passwordExpired) {
        throw new PasswordChangeRequiredError(
          passwordExpired ? 'Password has expired and must be changed' : undefined,
          { passwordExpired }
        );
      }

      // 3. Verify token hash against database record
      const fullUser = await authRepository.findByUsername(user.username);
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

      await userActivityService.recordRequestActivity(user, {
        action: 'AUTH_REFRESH',
        http_method: 'POST',
        route_template: '/api/auth/refresh',
        response_status: 200,
        ip_address: metadata.ip_address || null,
        user_agent: metadata.user_agent || null,
        occurred_at: new Date().toISOString(),
      });

      return { accessToken };
    } catch (error) {
      if (error instanceof AuthenticationError || error instanceof PasswordChangeRequiredError) {
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
    await authRepository.updateRefreshToken(userId, null);
    logger.info(`User logged out and session revoked: ID ${userId}`, { userId });
    return true;
  }
}

module.exports = new AuthService();
