import hero from './assets/hero-aircraft.jpg'
import { LoyaltyBanner } from './LoyaltyBanner'
import { SearchCard } from './SearchCard'
import { SiteFooter } from './SiteFooter'
import { TrendingDestinations } from './TrendingDestinations'

/** Public landing page, built from the "Composite / Homepage v2" frame in the design file. */
export function HomePage() {
  return (
    <div className="flex-1 bg-muted selection:bg-brand-accent/40 selection:text-navy">
      <main>
        <section className="relative isolate">
          {/* A photo band of 80% of the window height. The search form flows normally over it, and the aircraft is anchored
              into the part above the form. */}
          <div className="absolute inset-x-0 top-0 -z-10 h-[75vh] min-h-[26rem] overflow-hidden bg-navy">
            {/* The largest paint on the page, so it loads first and has its size reserved. */}
            <img
              src={hero}
              alt=""
              width={3344}
              height={1882}
              fetchPriority="high"
              decoding="async"
              className="absolute right-0 top-[calc(5.5rem-48%)] h-full w-full max-w-[1500px] [mask-composite:intersect] [mask-image:linear-gradient(to_right,transparent,black_12%),linear-gradient(to_bottom,black_75%,transparent)] object-cover object-[55%_50%] lg:top-[calc(5rem-432px)] lg:h-[900px] lg:object-[35%_50%]"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[rgba(20,33,61,0.85)] via-[rgba(20,33,61,0.4)] via-60% to-transparent md:from-[rgba(20,33,61,0.78)] md:via-[rgba(20,33,61,0.35)] md:to-[rgba(20,33,61,0)]" />
          </div>
          {/* Tight enough that the whole search form is on the first screen of a laptop, since searching is the page's job. */}
          <div className="mx-auto flex w-full max-w-[79rem] flex-col gap-8 px-4 pt-10 md:px-6 md:pt-60 xl:px-8 md:gap-16">
            {/* The one authored moment: the headline and then the search settle in once. Skipped for reduced motion. */}
            <div className="flex max-w-[520px] animate-in flex-col gap-4 duration-700 ease-out fade-in slide-in-from-bottom-4 fill-mode-backwards motion-reduce:animate-none">
              <h1 className="whitespace-nowrap m-0 font-serif text-[2rem]/10 font-bold tracking-[-0.02em] text-white md:text-display">
                Where to <span className="text-brand-accent">next?</span>
              </h1>
              <p className="max-w-[400px] text-xl/normal text-white">
                Search flights, check in online or ship cargo with Flython Airlines.
              </p>
            </div>
            <div
              className="animate-in duration-700 ease-out fade-in slide-in-from-bottom-4 fill-mode-backwards motion-reduce:animate-none"
              style={{ animationDelay: '150ms' }}
            >
              <SearchCard />
            </div>
          </div>
        </section>

        <div className="mx-auto flex max-w-[79rem] flex-col gap-16 px-4 pt-16 pb-20 md:px-6 xl:px-8 md:gap-[72px]">
          <TrendingDestinations />
          <LoyaltyBanner />
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
