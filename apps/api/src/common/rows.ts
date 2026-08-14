export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  token_version: number;
  is_global_admin: boolean;
  acknowledged_tour_ids: string[];
  disabled_at: string | null;
  last_signed_in_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MembershipRow {
  team_id: string;
  user_id: string;
  role: "owner" | "admin" | "member" | "viewer";
  joined_at: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  tokenVersion: number;
  isGlobalAdmin: boolean;
  authMethod: "session" | "apiToken";
}
