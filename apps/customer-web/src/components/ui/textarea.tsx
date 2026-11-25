import * as React from 'react'
import { cn } from '@customer-web/lib/utils'
import { controlClass } from './control'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(controlClass, 'flex field-sizing-content min-h-24 py-2.5', className)} {...props} />
}

export { Textarea }
