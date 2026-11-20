import type { DbService } from '@backend/db/db.service'

export async function seedSecurityRole(db: DbService, email?: string) {
  return db.$transaction(
    async (tx) => {
      const matches = email
        ? await tx.staff.findMany({
            where: {
              deleted_at: null,
              user: { email: { equals: email.trim(), mode: 'insensitive' }, type: 'staff', disabled_at: null, deleted_at: null },
            },
            select: { id: true, user: { select: { clerk_user_id: true } } },
          })
        : []
      if (email && (matches.length !== 1 || !matches[0].user.clerk_user_id)) {
        throw new Error('Expected exactly one enabled Clerk-linked staff account. No changes were made.')
      }
      const role = await tx.role.upsert({
        where: { code: 'security' },
        create: { code: 'security', name: 'Security', is_admin: false },
        update: {},
        select: { id: true, code: true, is_admin: true },
      })
      if (role.is_admin) throw new Error('The existing security role has admin privileges. No changes were made.')
      const staffId = matches[0]?.id
      if (staffId) await tx.staff.update({ where: { id: staffId }, data: { role_id: role.id, updated_at: new Date() } })
      return { roleId: role.id, staffId: staffId ?? null }
    },
    { isolationLevel: 'Serializable' },
  )
}
