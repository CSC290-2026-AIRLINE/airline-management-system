import { useEffect, useRef, useState } from 'react'
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
    <ProfileDialog title="Upload profile photo" onClose={onClose} kind="profile-dialog--upload" closeButton>
      <p className="profile-fine">JPG or PNG · up to 5 MB</p>
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          chooseFile(event.dataTransfer.files[0])
        }}
      >
        <button type="button" className="profile-drop-zone" onClick={() => input.current?.click()}>
          {photo ? (
            <img className="profile-photo-preview" src={photo} alt="Selected profile photo" />
          ) : (
            <span className="profile-upload-arrow" aria-hidden="true">
              ↑
            </span>
          )}
          <strong>
            {reading ? (
              'Reading image…'
            ) : photo ? (
              'Choose a different photo'
            ) : (
              <>
                <span className="profile-desktop">Drag a photo here or browse</span>
                <span className="profile-mobile">Choose a photo</span>
              </>
            )}
          </strong>
          <span className="profile-fine">
            <span className="profile-desktop">It’s shown to you and to staff helping you.</span>
            <span className="profile-mobile">Tap to browse your device</span>
          </span>
        </button>
        <input ref={input} type="file" accept="image/jpeg,image/png" hidden onChange={(event) => chooseFile(event.target.files?.[0])} />
      </div>
      {error && (
        <p className="profile-error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <button className="profile-button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="profile-button profile-button--primary"
          disabled={!photo || !file || reading}
          onClick={() => {
            if (file) onConfirm(photo, file)
          }}
        >
          Upload<span className="profile-desktop"> photo</span>
        </button>
      </footer>
    </ProfileDialog>
  )
}
