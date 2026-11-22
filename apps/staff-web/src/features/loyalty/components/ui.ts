// Tailwind class strings for the Feature 11 staff page frame. The page content uses the shadcn components directly.
export const ui = {
  // The starter index.css styles bare h1/h2 (serif, light colour, big margins); reset them inside the loyalty pages.
  shell:
    'flex-1 text-left text-sm text-foreground [&_:is(h1,h2,h3)]:m-0 [&_:is(h1,h2,h3)]:font-sans [&_:is(h1,h2,h3)]:tracking-normal [&_:is(h1,h2,h3)]:text-foreground',
  // A 4% gutter beside the sidebar, centred once it reaches 1440px on very wide screens.
  main: 'mx-auto flex w-full max-w-[1440px] min-w-0 flex-col gap-4 px-4 pt-4 pb-10 sm:px-6 lg:px-[4%] lg:pt-12 lg:pb-16',
  title: 'text-2xl leading-tight font-bold tracking-tight sm:text-3xl',
  purpose: '-mt-2 text-sm text-muted-foreground sm:text-base',
}
