import { SetMetadata } from '@nestjs/common'

export const IS_SUPERVISOR_KEY = 'isSupervisorRequired'
export const SupervisorOnly = () => SetMetadata(IS_SUPERVISOR_KEY, true)
