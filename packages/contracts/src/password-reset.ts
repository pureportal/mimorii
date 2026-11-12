export interface PasswordResetInspection {
  email: string;
  twoFactorRequired: boolean;
  expiresAt: string;
}

export interface AdminPasswordReset {
  url: string;
  expiresAt: string;
  emailed: boolean;
}
