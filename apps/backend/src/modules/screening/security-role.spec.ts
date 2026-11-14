import { canUseSecurityScreens } from './security-role'

describe('canUseSecurityScreens', () => {
  it('allows the security role and any admin role', () => {
    expect(canUseSecurityScreens({ code: 'security' })).toBe(true)
    expect(canUseSecurityScreens({ code: 'super_admin', is_admin: true })).toBe(true)
  })
  it('refuses other roles, including ones merely named admin without the admin flag', () => {
    expect(canUseSecurityScreens({ code: 'check_in', is_admin: false })).toBe(false)
    expect(canUseSecurityScreens({ code: 'admin' })).toBe(false)
    expect(canUseSecurityScreens({ code: 'admin', is_admin: null })).toBe(false)
  })
})
