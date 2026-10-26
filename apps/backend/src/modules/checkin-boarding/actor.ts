/** Who is calling: a customer (staffId null) or a staff member. */
export interface Actor {
  userId: string
  staffId: string | null
}
