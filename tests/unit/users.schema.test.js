const {
  createUserSchema,
  adminResetPasswordSchema,
  selfChangePasswordSchema,
} = require('../../src/modules/users/users.schema');

describe('user password schemas', () => {
  const validAccount = {
    username: 'secure-user',
    password: 'secure1!',
    display_name: 'Secure User',
    role: 'operator',
  };

  it('accepts secure passwords in create, reset, and self-change payloads', () => {
    expect(createUserSchema.safeParse(validAccount).success).toBe(true);
    expect(adminResetPasswordSchema.safeParse({ new_password: 'secure1!' }).success).toBe(true);
    expect(selfChangePasswordSchema.safeParse({ new_password: 'secure1!' }).success).toBe(true);
  });

  it.each([
    'short1!',
    '12345678!',
    'password!',
    'password1',
    'pass word1!',
  ])('rejects insecure password %s on every password-setting schema', (password) => {
    expect(createUserSchema.safeParse({ ...validAccount, password }).success).toBe(false);
    expect(adminResetPasswordSchema.safeParse({ new_password: password }).success).toBe(false);
    expect(selfChangePasswordSchema.safeParse({ new_password: password }).success).toBe(false);
  });
});
