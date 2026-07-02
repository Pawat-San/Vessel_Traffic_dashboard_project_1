const { setupTestDb, teardownTestDb } = require('../helpers/setup');
const { createUser } = require('../helpers/factory');
const authService = require('../../src/modules/auth/auth.service');
const { AuthenticationError } = require('../../src/utils/errors');

describe('AuthService Unit Tests', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('login()', () => {
    it('should successfully authenticate active users and issue JWTs', async () => {
      // Seed user
      const user = createUser({
        username: 'testadmin',
        password: 'adminpassword',
        display_name: 'Test Administrator',
        role: 'admin',
      });

      const res = await authService.login('testadmin', 'adminpassword');

      expect(res).toHaveProperty('accessToken');
      expect(res).toHaveProperty('refreshToken');
      expect(res.user.username).toBe('testadmin');
      expect(res.user.role).toBe('admin');
    });

    it('should reject authentication for incorrect passwords', async () => {
      await expect(
        authService.login('testadmin', 'wrongpassword')
      ).rejects.toThrow(AuthenticationError);
    });

    it('should reject authentication for non-existent users', async () => {
      await expect(
        authService.login('ghostuser', 'password')
      ).rejects.toThrow(AuthenticationError);
    });
  });

  describe('refresh()', () => {
    it('should issue new access tokens when given a valid refresh token', async () => {
      const user = createUser({
        username: 'refresher',
        password: 'password123',
      });

      // Login to get tokens
      const loginRes = await authService.login(user.username, 'password123');

      // Wait 1 second to ensure new JWT iat/exp differ
      await new Promise(r => setTimeout(r, 1000));

      // Request new token using the refresh token
      const refreshRes = await authService.refresh(loginRes.refreshToken);

      expect(refreshRes).toHaveProperty('accessToken');
      expect(refreshRes.accessToken).not.toBe(loginRes.accessToken);
    });

    it('should throw AuthenticationError for malformed refresh tokens', async () => {
      await expect(
        authService.refresh('invalid-token-string')
      ).rejects.toThrow(AuthenticationError);
    });
  });

  describe('logout()', () => {
    it('should nullify the refresh token hash on user logout', async () => {
      const user = createUser({
        username: 'logoutuser',
        password: 'password123',
      });

      const loginRes = await authService.login(user.username, 'password123');
      
      // Perform logout
      await authService.logout(user.id);

      // Verify token is revoked by attempting to refresh (should fail)
      await expect(
        authService.refresh(loginRes.refreshToken)
      ).rejects.toThrow(AuthenticationError);
    });
  });
});
