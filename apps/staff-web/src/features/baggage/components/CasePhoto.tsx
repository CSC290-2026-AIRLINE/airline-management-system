import { useState } from 'react'
import { XIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Dialog, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from '@staff-web/components/ui/dialog'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { useCasePhoto } from '../hooks/useCasePhoto'

/** The photo full size over a dark backdrop. Escape, the close button or a click outside the photo closes it. */
function PhotoViewer({ url, alt }: { url: string; alt: string }) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="View the photo full size"
          className="cursor-zoom-in self-start rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <img
            src={url}
            alt={alt}
            className="max-h-64 w-full max-w-[320px] rounded-lg border border-[#d8dce6] bg-[#f8fafc] object-contain"
          />
        </button>
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="bg-black/85" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-6 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 max-md:p-3"
        >
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <img
            src={url}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full cursor-default rounded-lg object-contain shadow-2xl"
          />
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white outline-none hover:bg-white/20 focus-visible:ring-[3px] focus-visible:ring-white/60"
          >
            <XIcon aria-hidden className="size-6" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}

/**
 * "Photo from the passenger": the bag photo attached to a lost bag report. A click shows it full size on the same page.
 * Shows a short line when there is no photo, so staff know it was not left out.
 */
export function CasePhoto({ reportId, hasPhoto, caseNumber }: { reportId: string; hasPhoto: boolean; caseNumber: string }) {
  const photo = useCasePhoto(reportId, hasPhoto)

  return (
    <div className="flex flex-col gap-2">
      <h3 className="m-0 text-sm font-medium text-[#677287]">Photo from the passenger</h3>
      {!hasPhoto ? (
        <p className="text-base text-[#14213d]">No photo</p>
      ) : photo.loading ? (
        <Skeleton className="h-48 w-full max-w-[320px] rounded-lg" />
      ) : photo.url ? (
        <PhotoViewer url={photo.url} alt={`Bag photo for case ${caseNumber}`} />
      ) : (
        <p className="text-sm text-[#677287]">{photo.error ?? 'The photo could not be loaded.'}</p>
      )}
    </div>
  )
}
