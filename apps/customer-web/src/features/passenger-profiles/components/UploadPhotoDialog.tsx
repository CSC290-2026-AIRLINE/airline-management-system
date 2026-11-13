import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@customer-web/components/ui/button'
import { DialogFooter } from '@customer-web/components/ui/dialog'
import FormError from '@customer-web/features/passenger-profiles/components/FormError'
import ProfileDialog from '@customer-web/features/passenger-profiles/components/ProfileDialog'

export default function UploadPhotoDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: (photo: string, file: File) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const reader = useRef<FileReader | null>(null)
  const [photo, setPhoto] = useState('')
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  useEffect(() => () => reader.current?.abort(), [])
  function chooseFile(file?: File) {
    reader.current?.abort()
    setPhoto('')
    setFile(null)
    setError('')
    setReading(false)
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024 || file.size === 0) {
      setError('Choose a JPG or PNG image up to 5 MB.')
      return
    }
    setReading(true)
    const nextReader = new FileReader()
    reader.current = nextReader
    nextReader.onerror = () => {
      setError('This image could not be read.')
      setReading(false)
    }
    nextReader.onload = () => {
      const result = nextReader.result
      if (typeof result !== 'string') return
      const image = new Image()
      image.onload = () => {
        if (reader.current === nextReader) {
          setPhoto(result)
          setFile(file)
          setReading(false)
        }
      }
      image.onerror = () => {
        if (reader.current === nextReader) {
          setError('Choose a valid image file.')
          setReading(false)
        }
      }
      image.src = result
    }
    nextReader.readAsDataURL(file)
  }
  return (
    <ProfileDialog title="Upload profile photo" onClose={onClose}>
      <p className="text-sm text-muted-foreground">JPG or PNG · up to 5 MB</p>
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          chooseFile(event.dataTransfer.files[0])
        }}
      >
        <Button
          type="button"
          variant="outline"
          className="h-auto w-full flex-col gap-2 border-dashed py-8 whitespace-normal"
          onClick={() => input.current?.click()}
        >
          {photo ? (
            <img className="size-24 rounded-full object-cover object-center" src={photo} alt="Selected profile photo" />
          ) : (
            <Upload className="size-6 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="font-medium">
            {reading ? 'Reading image…' : photo ? 'Choose a different photo' : 'Drag a photo here or browse'}
          </span>
          <span className="text-xs font-normal text-muted-foreground">It’s shown to you and to staff helping you.</span>
        </Button>
        <input ref={input} type="file" accept="image/jpeg,image/png" hidden onChange={(event) => chooseFile(event.target.files?.[0])} />
      </div>
      {error && <FormError>{error}</FormError>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!photo || !file || reading}
          onClick={() => {
            if (file) onConfirm(photo, file)
          }}
        >
          Upload photo
        </Button>
      </DialogFooter>
    </ProfileDialog>
  )
}
