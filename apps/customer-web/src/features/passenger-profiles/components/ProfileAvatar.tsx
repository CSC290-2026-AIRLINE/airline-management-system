import { Avatar, AvatarFallback, AvatarImage } from '@customer-web/components/ui/avatar'
import { initials } from '@customer-web/features/passenger-profiles/profile-context'
import { cn } from '@customer-web/lib/utils'

export default function ProfileAvatar({ name, photo, className }: { name: string; photo: string | null; className?: string }) {
  return (
    <Avatar className={cn('size-24', className)}>
      {photo && <AvatarImage src={photo} alt={`${name} profile`} />}
      <AvatarFallback aria-label={`${name} initials`} className="text-2xl">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  )
}
