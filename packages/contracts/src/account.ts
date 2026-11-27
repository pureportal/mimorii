export interface PersonalDataExport {
  exportedAt: string;
  profile: {
    name: string;
    email: string;
    createdAt: string;
    lastSignedInAt: string | null;
    termsVersion: string;
    termsAcceptedAt: string;
  };
  teams: Array<{ name: string; role: string; joinedAt: string }>;
  apiTokens: Array<{
    name: string;
    createdAt: string;
    lastUsedAt: string | null;
    expiresAt: string | null;
  }>;
  connectedApps: Array<{
    name: string;
    scopes: string[];
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
  }>;
  notificationDevices: Array<{ platform: string; status: string; lastSeenAt: string }>;
  activity: Array<{ action: string; subject: string; at: string }>;
}
