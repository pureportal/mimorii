import type { DatabaseService } from "../database/database.service.js";

export async function revokeOAuthGrant(
  database: DatabaseService,
  grantId: string,
  revokedAt: string
): Promise<void> {
  await database.run(
    "UPDATE oauth_grants SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
    revokedAt,
    grantId
  );
  await database.run(
    `UPDATE oauth_refresh_tokens SET revoked_at = ?
     WHERE family_id = ? AND revoked_at IS NULL`,
    revokedAt,
    grantId
  );
  await database.run(
    `UPDATE oauth_access_tokens SET revoked_at = ?
     WHERE refresh_family_id = ? AND revoked_at IS NULL`,
    revokedAt,
    grantId
  );
}
