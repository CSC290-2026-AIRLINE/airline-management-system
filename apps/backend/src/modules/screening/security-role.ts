/** Security screens (watchlist, screening queue and review) are open to the `security` role and to admin roles. */
export function canUseSecurityScreens(role: { code: string; is_admin?: boolean | null }): boolean {
  return role.code === 'security' || role.is_admin === true
}
