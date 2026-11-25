/**
 * The look every form control shares (redesign board 6): input, textarea, select trigger and the date field.
 * 1 px border in the control grey (3.9:1, so it passes as a non-text element), 8 px radius, 16 px text so phones do not
 * zoom on focus. The border darkens on hover, turns link blue with the focus ring on keyboard focus, and goes red on
 * error; the sentence and icon that go with the error come from Field. A control is 44 px tall, set where it is used.
 */
export const controlClass =
  'w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground transition-colors outline-none placeholder:text-muted-foreground hover:border-copy focus-visible:border-link focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-destructive aria-invalid:hover:border-destructive disabled:cursor-not-allowed disabled:border-line disabled:bg-disabled disabled:text-control disabled:hover:border-line'
